---
layout: post
title: "Cannot assign requested address 排障实录：从报错到根因的完整路径"
date: 2026-06-02 16:21:00 +0800
tags: [Linux, TCP, 网络, 排障, HttpClient, 端口耗尽]
---

# Cannot assign requested address 排障实录

## 背景

我们的 API 网关在转发请求到后端服务时，突然出现大量建连失败：

```json
{
  "status": {
    "status_code": 400,
    "message": "Service Host is invalid. Please contact Service Provider for help. Connect to vm.corp.com:80 [vm.corp.com/10.10.10.10] failed: Cannot assign requested address (connect failed)"
  }
}
```

表面看是"Service Host is invalid"，实际是建连阶段就失败了——内核无法为出站连接分配本地端口。本文记录完整的排障过程，每一步 check 点都值得学习。

---

## Step 1：读懂真正的错误信息

应用层抛出的是 `HttpHostConnectException`，代码把它映射成了"Service Host is invalid"，但真正的关键词是底层的：

> **Cannot assign requested address (connect failed)**

这对应 Linux 内核错误码 `EADDRNOTAVAIL`，含义是：调用 `connect()` 系统调用时，内核无法为这个出站连接分配本地地址（端口）。连接在三次握手之前就失败了。

不要被应用层的错误提示误导，看最底层的异常信息。`EADDRNOTAVAIL` 表示的是"建连发起失败"，不是"连接被拒绝"或"超时"。

---

## Step 2：确认是本地端口耗尽

`Cannot assign requested address` 最常见的原因是本地临时端口（ephemeral port）被用完了。诊断命令：

```bash
# 查看各状态连接数统计
ss -s

# 按状态分组统计
netstat -n | awk '/^tcp/ {++S[$NF]} END {for(a in S) print a, S[a]}'

# 查看本地端口范围
cat /proc/sys/net/ipv4/ip_local_port_range
```

**我们的结果：** TIME_WAIT 数量2万多，而默认端口范围是 `32768-60999`（约 28000 个），接近耗尽。

**知识点：** 每个 TCP 连接需要占用一个本地端口。连接关闭后进入 TIME_WAIT 状态（持续 60 秒），期间端口不可用。如果每秒新建的连接数 × 60 > 可用端口数，就会耗尽，新连接在 `connect()` 阶段直接失败。

---

## Step 3：定位代码层面的根因

查看网关的转发代码，发现每次请求都新建一个 `HttpClient`：

```groovy
// 每次请求都创建新的 client，没有连接池复用
HttpClient httpclient = newClient();
```

并且用完后没有关闭，也没有连接池。每个请求都是：新建连接 → 使用 → TCP 关闭 → 进入 TIME_WAIT。高并发下 TIME_WAIT 快速堆积，端口被占满后新的 `connect()` 调用直接返回 `EADDRNOTAVAIL`。

**知识点：**

- `httpclient.close()` 能释放 Java 资源，但不能避免 TIME_WAIT——因为 TIME_WAIT 是 TCP 协议层面的，只要主动关闭连接就一定会有。
- 真正的解法是**连接池复用**——不关连接，就没有 TIME_WAIT。

---

## Step 4：尝试内核参数 tcp_tw_reuse

不改代码的情况下，尝试内核参数让系统在 `connect()` 时复用 TIME_WAIT 端口：

```bash
echo 1 > /proc/sys/net/ipv4/tcp_tw_reuse
```

**结果：** 没有效果，建连仍然失败。

---

## Step 5：发现 tcp_tw_reuse 的值含义在高版本内核中变了

检查内核版本：

```bash
uname -r
# 5.14
```

**关键发现：** 从 Linux 4.12 开始，`tcp_tw_reuse` 的语义变了：

| 值  | 含义                                         |
| --- | -------------------------------------------- |
| 0   | 禁用                                         |
| 1   | **仅对 loopback 地址生效**（4.12+ 的新语义） |
| 2   | 对所有连接生效                               |

我们的目标是 `10.118.168.60`（非 loopback），所以 `=1` 根本不会在 `connect()` 时触发复用。

```bash
# 修正为 2
sysctl -w net.ipv4.tcp_tw_reuse=2
```

---

## Step 6：设为 2 后仍未生效

建连仍然失败。这里需要纠正一个认知：

> **`tcp_tw_reuse` 不会让 TIME_WAIT 消失。** TIME_WAIT 仍然存在于 `ss` 的输出中，只是内核在 `connect()` 分配端口时允许复用这些处于 TIME_WAIT 的端口。

所以判断标准不是 TIME_WAIT 数减少，而是**新的 `connect()` 不再报错**。但我们仍然报错，说明复用没有实际发生。

通过内核计数器确认：

```bash
nstat -az | grep -i -E 'TW|TimeWait'
```

`TWRecycled` 没有增长，确认在 `connect()` 时端口复用没有触发。

---

## Step 7：发现 tcp_tw_reuse 的前置依赖——TCP Timestamps

`tcp_tw_reuse` 有一个硬性前提：**连接双方必须启用 TCP Timestamps（RFC 7323）**。

内核通过对比 TIME_WAIT 中连接的时间戳和新连接的时间戳来判断是否可以安全复用端口。没有时间戳，就无法判断，`connect()` 时不会复用 TIME_WAIT 端口。

抓包确认：

```bash
tcpdump -i any dst host 10.118.168.60 and dst port 80 -c 10 -nn | grep "TS val"
```

**结果：** 对端的 SYN-ACK 中没有 TCP Timestamp 选项。

**知识点：** TCP Timestamps 是在三次握手时协商的，任何一方不支持就不会启用。客户端开了 `tcp_timestamps=1` 没用，服务端也必须开。没有 timestamps 的情况下，`tcp_tw_reuse` 不会工作，`connect()` 仍然会因为找不到可用端口而返回 `EADDRNOTAVAIL`。

---

## Step 8：确认对端关闭了 tcp_timestamps

我们的客户端（网关）`tcp_timestamps=1`，但目标服务 VictoriaMetrics 的机器关闭了 timestamps。

在对端机器上确认：

```bash
sysctl net.ipv4.tcp_timestamps
# 结果为 0
```

---

## Step 9：评估让对端开启 tcp_timestamps 的风险

`tcp_timestamps=1` 是 Linux 的默认值，开启后：

- **正面：** TCP 性能更好（精确 RTT 测量）、支持 PAWS 防回绕保护
- **风险：** 几乎没有。唯一需要注意的是如果对端前面有 SNAT 型负载均衡，多台后端的 timestamp 不一致可能导致客户端的 PAWS 机制误判

对方当前的 `=0` 反而是非标准配置，可能是早期误导性运维文章的遗留。

---

## 最终解决方案

### 短期止血

1. 对端开启 `tcp_timestamps=1`，使 `tcp_tw_reuse=2` 在 `connect()` 时能复用 TIME_WAIT 端口
2. 扩大本地端口范围：`echo "1024 65535" > /proc/sys/net/ipv4/ip_local_port_range`

### 长期根治

将 HttpClient 改为连接池模式，复用已有 TCP 连接，从源头避免产生大量 TIME_WAIT：

```groovy
// 单例连接池化 HttpClient
private static final PoolingHttpClientConnectionManager connManager =
    new PoolingHttpClientConnectionManager();
static {
    connManager.setMaxTotal(200);
    connManager.setDefaultMaxPerRoute(50);
}

private static final CloseableHttpClient SHARED_CLIENT = HttpClients.custom()
    .setConnectionManager(connManager)
    .disableContentCompression()
    .build();
```

连接复用意味着同一个 TCP 连接反复使用，不会触发关闭，自然不会产生 TIME_WAIT，`connect()` 调用次数大幅减少。

---

## 排障路径总结（速查表）

```
报错 "Cannot assign requested address"
  │
  ├─ Step 1: 识别底层错误 → EADDRNOTAVAIL，connect() 阶段失败
  │
  ├─ Step 2: ss -s 确认 TIME_WAIT 数量 → 上万，端口耗尽
  │
  ├─ Step 3: 审查代码 → HttpClient 每次新建不复用，TIME_WAIT 堆积
  │
  ├─ Step 4: 尝试 tcp_tw_reuse=1 → 无效
  │
  ├─ Step 5: 检查内核版本 → 5.14，需要 =2 才对非 loopback 生效
  │
  ├─ Step 6: 设为 2 仍无效 → 通过 nstat 确认 connect() 时复用未触发
  │
  ├─ Step 7: 抓包确认 TCP Timestamps → 对端未启用
  │
  ├─ Step 8: 确认对端 tcp_timestamps=0
  │
  └─ Step 9: 让对端开启 timestamps / 代码改连接池（根治）
```

---

## 核心知识点回顾

1. **`Cannot assign requested address` = 内核的 EADDRNOTAVAIL**，是 `connect()` 阶段失败，最常见原因是临时端口耗尽
2. **TIME_WAIT 是 TCP 协议行为**，`close()` 不能避免，只有不关连接（连接池复用）才能根治
3. **`tcp_tw_reuse` 在 Linux 4.12+ 改了语义**，`=1` 仅 loopback，`=2` 才全局生效
4. **`tcp_tw_reuse` 依赖 TCP Timestamps**，双方都要开启才能在 `connect()` 时复用 TIME_WAIT 端口
5. **`tcp_timestamps=1` 是 Linux 默认值**，关掉它几乎没有合理理由

---

## 常用诊断命令速查

```bash
# 连接状态统计
ss -s
netstat -n | awk '/^tcp/ {++S[$NF]} END {for(a in S) print a, S[a]}'

# 到特定目标的连接
ss -tn dst 10.x.x.x:80 | awk '{print $1}' | sort | uniq -c

# 端口范围
cat /proc/sys/net/ipv4/ip_local_port_range

# 内核参数
sysctl net.ipv4.tcp_tw_reuse
sysctl net.ipv4.tcp_timestamps

# 内核版本（决定 tcp_tw_reuse 的语义）
uname -r

# 复用计数器
nstat -az | grep -i TW

# 抓包确认 timestamps
tcpdump -i any dst host 10.x.x.x -c 10 -nn | grep "TS val"

# 内核日志
dmesg | tail -50
```
