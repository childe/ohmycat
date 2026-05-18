---
layout: default
date: 2026-05-18 11:28:00 +0800
title: "Tomcat Connection: close 排障记录"
description: "OSG 网关 Tomcat BIO 线程池耗尽导致 keep-alive 连接被提前关闭的排查与修复"
---

Author: claudecode+opus4.6

# Connection: close 排障记录

> OSG 网关 Tomcat BIO 线程池耗尽导致 keep-alive 连接被提前关闭的排查与修复

## 目录

- [问题描述](#问题描述)
- [最终结论](#最终结论)
- [排查过程](#排查过程)
  - [第一步：确认 Connection: close 来源](#第一步确认-connection-close-来源是-osg-代码还是-tomcat)
  - [第二步：tcpdump 抓包分析](#第二步tcpdump-抓包分析)
  - [第三步：检查 server.xml 配置](#第三步检查-serverxml-配置)
  - [第四步：分析 Tomcat 源码](#第四步分析-tomcat-源码)
  - [第五步：检查生产错误日志](#第五步检查生产错误日志)
  - [第六步：添加调试日志](#第六步添加调试日志)
  - [第七步：分析调试日志](#第七步分析调试日志--发现两种模式)
  - [第八步：检查连接数和线程数](#第八步检查服务器连接数和线程数)
  - [第九步：确认根因](#第九步确认根因--bio-线程池耗尽)
  - [第十步：修复验证](#第十步修复验证)
- [排查中的错误推断](#排查中的错误推断)
- [涉及的关键文件](#涉及的关键文件)
- [相关知识](#相关知识)

---

## 问题描述

使用 （Tomcat 7.0.39）做了一个 HTTP 转发网关，前端 Nginx 通过 keep-alive 长连接将请求转发到 Tomcat 。观察到 keep-alive 连接在远低于 `maxKeepAliveRequests`（1000）设定值时就被关闭，通常处理不到 10 个请求后响应中就出现 `Connection: close`，导致 Nginx 频繁重建 TCP 连接。

**环境信息：**

| 组件 | 版本/配置 |
|------|-----------|
| Tomcat | 7.0.39 |
| Connector | BIO (`protocol="HTTP/1.1"`) |
| maxThreads | 150 |
| maxKeepAliveRequests | 1000 |
| 前端 | Nginx (keep-alive) |

---

## 最终结论

{: .highlight }
> **根因**：Tomcat 使用 BIO connector（`protocol="HTTP/1.1"`），maxThreads=150，而实际 TCP 连接数达到 388。BIO 下每个连接（包括空闲 keep-alive）占一个线程，线程池严重不足，Tomcat 被迫主动关闭 keep-alive 回收线程。
>
> **修复**：将 `protocol="HTTP/1.1"` 改为 `protocol="org.apache.coyote.http11.Http11NioProtocol"`，切换后问题立即消失。

---

## 排查过程

### 第一步：确认 Connection: close 来源是 代码还是 Tomcat

分析代码中 Response Header 的处理逻辑。

`GateRequestExecutor.isValidGateResponseHeader()` 方法过滤了后端返回的以下 header：

```groovy
// osg-scripts/src/main/groovy/scripts/route/GateRequestExecutor.groovy:471
boolean isValidGateResponseHeader(String name) {
    switch (name.toLowerCase()) {
        case "connection":           // ← 后端返回的 Connection header 被过滤
        case "content-length":
        case "content-encoding":
        case "server":
        case "transfer-encoding":
        case "access-control-allow-origin":
        case "access-control-allow-headers":
            return false
        default:
            return true
    }
}
```

**结论**：后端返回的 `Connection` header 被代码过滤掉了，不会透传给客户端。响应中出现的 `Connection: close` 只可能来自 **Tomcat 自身**。

---

### 第二步：tcpdump 抓包分析

在服务器上抓取了一个完整的 TCP 连接（从 SYN 到 FIN）。

**抓包结果：**

- 来源：`10.145.1.100:13032` → `10.1.1.100:80`
- 完整 TCP 三次握手（SYN → SYN-ACK → ACK）
- 7 个 HTTP 请求，全部 HTTP/1.1，请求头中没有 `Connection: close`
- 7 个响应，前 6 个正常，**第 7 个响应带 `Connection: close`**
- 所有 7 个响应状态码均为 **200 OK**

```
请求1: POST /api/GetApp     → 200 OK
请求2: POST /api/GetRoute   → 200 OK
请求3: POST /api/GetPage                 → 200 OK
请求4: POST /api/abapi                       → 200 OK
请求5: POST /api/GetGroup   → 200 OK
请求6: POST /api/12345
请求7: POST /api/GetGroup   → 200 OK + Connection: close ⚠️
```

**结论**：排除了请求头 `Connection: close`、HTTP/1.0、非 200 状态码等原因。

---

### 第三步：检查 server.xml 配置

```bash
grep -i "keepAlive\|Connector" conf/server.xml
```

确认 `maxKeepAliveRequests="1000"`。7 个请求远未达到 1000 的上限，排除 maxKeepAliveRequests 耗尽。

同时确认 `maxThreads="150"`。

---

### 第四步：分析 Tomcat 源码

阅读 Tomcat 7.0.39 `AbstractHttp11Processor.java` 源码，找到所有设置 `keepAlive = false` 的条件：

| # | 条件 | 是否排除 |
|---|------|----------|
| 1 | `maxKeepAliveRequests` 计数器耗尽 | ✅ 已排除（7 << 1000） |
| 2 | HTTP/1.0 且无 `Connection: keep-alive` | ✅ 已排除（HTTP/1.1） |
| 3 | 请求头中包含 `Connection: close` | ✅ 已排除（抓包确认无） |
| 4 | `statusDropsConnection(statusCode)` 返回 true | ✅ 已排除（全是 200） |
| 5 | `response.getErrorException()` 不为 null | ❓ 待确认 |

`statusDropsConnection` 触发的状态码：400, 408, 411, 413, 414, 500, 501, 503

---

### 第五步：检查生产错误日志

查看 `catalina.out` 中的错误日志，发现三类频繁出现的异常：

1. **Hystrix 信号量拒绝**：`could not acquire a semaphore for execution` → 映射为 406
2. **ServiceTimeDeny**：`Sorry Your Openid is denied on currentTime` → 映射为 403
3. **JSON 解析异常**：`com.alibaba.fastjson.JSONException` → 在 `ServiceAuthority.doVerify()` 中被 try-catch 吞掉，不会导致 500

初步怀疑是错误状态码触发了 `statusDropsConnection()`，但与 tcpdump 中全部 200 的事实矛盾。

---

### 第六步：添加调试日志

在 `SendResponse.groovy` 和 `GateServlet.java` 中添加 `CONNECTION_DEBUG` 日志，通过反射读取 Tomcat `Http11Processor` 内部状态：

| 采集字段 | 含义 |
|----------|------|
| `keepAlive` | Tomcat 是否保持连接 |
| `keepAliveLeft` | 剩余 keepAlive 次数 |
| `error` / `errorException` | 内部错误状态 |
| `openSocket` / `keptAlive` | 连接状态 |

日志分别在 **BEFORE_WRITE**（写响应前）和 **AFTER_WRITE**（写响应后）两个时机采集，用于判断 keepAlive 是在哪个阶段被设为 false。

日志输出到独立文件 `logs/conn-debug.log`（logback 中配置独立 appender，logger name = `CONNECTION_DEBUG`，level = INFO，`additivity=false`）。

---

### 第七步：分析调试日志 — 发现两种模式

部署后采集了 1 秒的日志（3566 行），发现 `keepAlive=false` 有两种不同的模式：

#### 模式一：BEFORE_WRITE 时 keepAlive 就已经是 false

```log
BEFORE_WRITE uri=/api/ops_hr_getEmployee, keepAlive=false, keepAliveLeft=-1
AFTER_WRITE_RESPONSE uri=/api/ops_hr_getEmployee, finalStatus=200
```

**特征**：`keepAliveLeft=-1`，响应状态码 200，但 keepAlive 在请求解析阶段就被关闭。

#### 模式二：AFTER_WRITE 后 keepAlive 才变为 false

```log
BEFORE_WRITE uri=/api/ckapi, keepAlive=true, keepAliveLeft=993
AFTER_HEADERS uri=/api/ckapi, status=400
AFTER_WRITE  uri=/api/ckapi, keepAlive=false, keepAliveLeft=993
```

**特征**：`keepAliveLeft` 为正数，由 `statusDropsConnection(400)` 触发。

{: .important }
> **模式一是大量 200 响应带 `Connection: close` 的主因**，与 tcpdump 观察一致。

---

### 第八步：检查服务器连接数和线程数

```bash
$ ss -tnp | grep :80 | wc -l
388

$ grep -i "maxThreads" conf/server.xml
maxThreads="150"
```

**关键发现**：**388 个 TCP 连接，150 个线程**。BIO connector 下每个连接（包括空闲 keep-alive）占一个线程，线程池严重超载。

`conn-debug.log` 中线程名从 `http-bio-80-exec-1` 到 `http-bio-80-exec-187`，确认使用 BIO connector。

---

### 第九步：确认根因 — BIO 线程池耗尽

BIO connector 的工作模式：

```
┌─────────────────────────────────────────────────────────┐
│  BIO: 每个 TCP 连接绑定一个线程                            │
│                                                         │
│  连接1 ──→ 线程1 (处理请求 / 空闲等待)                     │
│  连接2 ──→ 线程2 (处理请求 / 空闲等待)                     │
│  ...                                                    │
│  连接150 ──→ 线程150 (处理请求 / 空闲等待)                 │
│  连接151 ──→ ❌ 无可用线程！触发自我保护                    │
│                                                         │
│  自我保护：keepAlive=false, keepAliveLeft=-1              │
│           强制关闭 keep-alive 连接以回收线程               │
└─────────────────────────────────────────────────────────┘
```

这解释了所有观察到的现象：

| 现象 | 解释 |
|------|------|
| **随机性** | 取决于当时线程池的繁忙程度 |
| **<10 次请求就关闭** | 不是 maxKeepAliveRequests 的限制，是线程不够用 |
| **200 响应也带 Connection: close** | 跟请求结果无关，是线程压力导致 |

---

### 第十步：修复验证

修改 `server.xml`，将 BIO 切换为 NIO：

```xml
<!-- 修复前 -->
<Connector port="80" protocol="HTTP/1.1"
           maxThreads="150" maxKeepAliveRequests="1000" ... />

<!-- 修复后 -->
<Connector port="80" protocol="org.apache.coyote.http11.Http11NioProtocol"
           maxThreads="150" maxKeepAliveRequests="1000" ... />
```

NIO connector 使用 I/O 多路复用，空闲 keep-alive 连接不占线程。150 个线程可以服务数千个 keep-alive 连接。

**重启后 Connection: close 提前关闭的问题消失。** ✅

---

## 排查中的错误推断

记录排查过程中走过的弯路，供参考：

| # | 错误推断 | 实际情况 |
|---|----------|----------|
| 1 | maxKeepAliveRequests=7 | tcpdump 显示 7 个请求后关闭，最初猜测配置为 7。实际是 1000 |
| 2 | Tomcat 高负载自动降低 keepAlive | 查阅源码未找到该机制（但 BIO 确实有线程压力保护行为） |
| 3 | JSON 解析异常导致 500 | `ServiceAuthority.doVerify()` 中 JSONException 被 try-catch 吞掉，不会冒泡 |
| 4 | 错误状态码是主因 | `statusDropsConnection` 只影响少量出错请求（模式二），主因是 BIO 线程池耗尽（模式一） |

---

## 相关知识

### Tomcat BIO vs NIO

| | BIO (`HTTP/1.1`) | NIO (`Http11NioProtocol`) |
|---|---|---|
| **线程模型** | 1 连接 = 1 线程 | I/O 多路复用，线程仅在有数据时使用 |
| **keep-alive 空闲连接** | 占线程 | 不占线程 |
| **maxThreads=150 能服务的连接** | ~150 | 数千 |
| **适用场景** | 低并发、短连接 | 高并发、长连接 |

### statusDropsConnection 触发条件

以下状态码会触发 Tomcat 关闭 keep-alive 连接：

`400` · `408` · `411` · `413` · `414` · `500` · `501` · `503`
