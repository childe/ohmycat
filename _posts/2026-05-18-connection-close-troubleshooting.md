---
date: 2026-05-18 11:28:00 +0800
title: "Tomcat Connection: close 排障记录"
description: "OSG 网关 Tomcat BIO connector 在线程紧张时自动停发 keep-alive，导致连接被提前关闭的排查与修复"
layout: post
---

Author: claudecode+opus4.6

# Connection: close 排障记录

> OSG 网关 Tomcat BIO connector 在线程紧张时自动停发 keep-alive，导致连接被提前关闭的排查与修复

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
  - [第九步：确认根因](#第九步确认根因--bio-的-keep-alive-自保护)
  - [第十步：修复验证](#第十步修复验证)
- [排查中的错误推断](#排查中的错误推断)
- [相关知识](#相关知识)
- [勘误（2026-08-27 复核）](#勘误2026-08-27-复核)

---

## 问题描述

使用 （Tomcat 7.0.39）做了一个 HTTP 转发网关，前端 Nginx 通过 keep-alive 长连接将请求转发到 Tomcat 。观察到 keep-alive 连接在远低于 `maxKeepAliveRequests`（100）上限时就被关闭，通常处理不到 10 个请求后响应中就出现 `Connection: close`，导致 Nginx 频繁重建 TCP 连接。

**环境信息：**

| 组件 | 版本/配置 |
|------|-----------|
| Tomcat | 7.0.39 |
| Connector | BIO (`protocol="HTTP/1.1"`) |
| maxThreads | 200（默认值，80 端口 Connector 未显式配置） |
| maxKeepAliveRequests | 100（默认值，未显式配置） |
| disableKeepAlivePercentage | 75（默认值）—— 本文根因的关键旋钮 |
| 前端 | Nginx (keep-alive) |

{: .warning }
> 初版这里写的是 maxThreads=150 / maxKeepAliveRequests=1000，**是错的**，见文末[勘误](#勘误2026-08-27-复核)。

---

## 最终结论

{: .highlight }
> **根因**：Tomcat 使用 BIO connector（`protocol="HTTP/1.1"`）。BIO 下每个连接（包括空闲的 keep-alive 连接）独占一个线程，忙线程占比很快压过 `disableKeepAlivePercentage`（默认 **75%**），触发 BIO 专属的自我保护逻辑 `Http11Processor.disableKeepAlive()`：Tomcat 把这条连接的 `keepAliveLeft` 直接置 0，于是**哪怕响应是 200，也会带上 `Connection: close`**，用关连接来回收线程。
>
> **修复**：将 `protocol="HTTP/1.1"` 改为 `protocol="org.apache.coyote.http11.Http11NioProtocol"`，切换后问题立即消失。之所以有效，不只是"NIO 更省线程"——`Http11NioProcessor.disableKeepAlive()` 是硬编码的 `return false`，**这条自我保护路径在 NIO 下根本不存在**。

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

排除了 maxKeepAliveRequests 耗尽：7 个请求远达不到上限。

{: .warning }
> **这一步当时读错了配置。** 这个 grep 会把被 `<!-- -->` 注释掉的模板段和 **8443 端口的 SSL Connector** 一起打出来，而 `maxThreads="150"` 恰恰只出现在那两处；80 端口的 Connector 从头到尾只配了 `connectionTimeout`。`maxKeepAliveRequests` 更是整个文件里都不存在。也就是说 80 端口用的其实是 Tomcat 默认值 **maxThreads=200、maxKeepAliveRequests=100**。
>
> 教训：`grep` 看 server.xml 一定要确认命中的行属于**哪一个 Connector**、以及**是不是在注释里**。正确的做法是 `grep -A6 'port="80"'` 把整段 Connector 打出来。

---

### 第四步：分析 Tomcat 源码

阅读 Tomcat 7.0.39 `AbstractHttp11Processor.java` 源码，找到所有设置 `keepAlive = false` 的条件：

| # | 条件 | 是否排除 |
|---|------|----------|
| 1 | `maxKeepAliveRequests` 计数器耗尽 | ✅ 已排除（7 << 100） |
| 2 | HTTP/1.0 且无 `Connection: keep-alive` | ✅ 已排除（HTTP/1.1） |
| 3 | 请求头中包含 `Connection: close` | ✅ 已排除（抓包确认无） |
| 4 | `statusDropsConnection(statusCode)` 返回 true | ✅ 已排除（全是 200） |
| 5 | `response.getErrorException()` 不为 null | ❓ 待确认 |
| 6 | **`disableKeepAlive()` 返回 true（BIO 独有）** | ❌ **当时漏了这一条——它才是真凶** |

`statusDropsConnection` 触发的状态码：400, 408, 411, 413, 414, 500, 501, 503

{: .warning }
> 第 6 条是这次源码阅读的最大疏漏。它不在 `AbstractHttp11Processor` 的请求循环里，而在**循环开始之前**、由子类实现：
>
> ```java
> // AbstractHttp11Processor.process()，进入请求循环前
> if (disableKeepAlive()) {
>     socketWrapper.setKeepAliveLeft(0);
> }
> ```
>
> 只盯着循环体内 `keepAlive = false` 的赋值点，就会正好错过它。

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

**特征**：`keepAliveLeft=-1`，响应状态码 200，但 keepAlive 在**请求行都还没解析**的时候就已经被判死。

`-1` 这个值本身就是指纹：`disableKeepAlive()` 命中后 `setKeepAliveLeft(0)`，随后 `prepareRequest()` 里 `decrementKeepAlive()` 把 0 减成 **-1** 并返回 `<= 0`，于是 `keepAlive = false`。正常耗尽 `maxKeepAliveRequests` 的话，计数是从 99 一路递减到 0，**永远不会出现 -1**。

#### 模式二：AFTER_WRITE 后 keepAlive 才变为 false

```log
BEFORE_WRITE uri=/api/ckapi, keepAlive=true, keepAliveLeft=993
AFTER_HEADERS uri=/api/ckapi, status=400
AFTER_WRITE  uri=/api/ckapi, keepAlive=false, keepAliveLeft=993
```

**特征**：`keepAliveLeft` 为正数，由 `statusDropsConnection(400)` 触发。

{: .warning }
> 这条日志里的 `keepAliveLeft=993` 和「maxKeepAliveRequests=100」对不上（默认值下它最大只能是 99）。原始日志已经拿不到了，无法复核，**这个数值请当作不可信**；模式二成立与否只取决于「keepAliveLeft 是正数」+「status 命中 statusDropsConnection」这两点，与具体数字无关。

{: .important }
> **模式一是大量 200 响应带 `Connection: close` 的主因**，与 tcpdump 观察一致。

---

### 第八步：检查服务器连接数和线程数

```bash
$ ss -tnp | grep :80 | wc -l
388
```

**关键发现**：`conn-debug.log` 中线程名从 `http-bio-80-exec-1` 一直排到 `http-bio-80-exec-187`。

- `http-bio` 这个前缀（`Http11Protocol.getNamePrefix()` 的返回值）确认了跑的就是 BIO connector；
- 编号排到 187 / maxThreads=200，说明线程池被大量创建过——BIO 下每个连接（**包括空闲的 keep-alive 连接**，它们阻塞在读下一个请求上）都占着一个线程。

真正证明"忙线程占比越过 75%"的，其实不是连接数，而是上一步那个 `keepAliveLeft=-1` 指纹在日志里反复出现——只有 `disableKeepAlive()` 命中才会产生这个值。

{: .warning }
> 这一步有两个坑：
>
> 1. **`grep :80` 会连出向连接一起数进去。** OSG 自己要往后端建连，后端大量跑在 `:80`/`:8080` 上，而 `":8080"` 里就含 `":80"`。所以 388 是入向 + 出向的混合数，不能直接当作「nginx→OSG 的 keep-alive 连接数」。应该按本地端口过滤：
>    ```bash
>    ss -tan state established '( sport = :80 )' | wc -l
>    ```
> 2. **`exec-187` 这个编号跟「maxThreads=150」本身就是矛盾的**（线程编号由工厂单调递增，150 上限下要出现 187 号得靠线程反复销毁重建）。它其实是 maxThreads 为默认值 200 的旁证——当时没注意到这个不一致。

---

### 第九步：确认根因 — BIO 的 keep-alive 自保护

BIO connector 的工作模式，以及它的自我保护阈值：

```
┌───────────────────────────────────────────────────────────────┐
│  BIO: 每个 TCP 连接绑定一个线程                                  │
│  —— 空闲的 keep-alive 连接也在占线程（阻塞在读下一个请求）          │
│                                                               │
│  连接1 ──→ 线程1 (处理请求 / 空闲等待)                           │
│  连接2 ──→ 线程2 (处理请求 / 空闲等待)                           │
│  ...                                                          │
│                                                               │
│  ┌── 忙线程 / maxThreads > 75%  ────────────────────────────┐   │
│  │   即 maxThreads=200 时，忙线程超过 150 个就触发           │   │
│  │   注意：线程池并不需要真的耗尽                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                    ↓                                          │
│  Http11Processor.disableKeepAlive() == true                   │
│      → setKeepAliveLeft(0) → 下次 decrement 得到 -1            │
│      → keepAlive=false → 响应带 Connection: close             │
│      → 关掉连接，把线程还给池子                                 │
└───────────────────────────────────────────────────────────────┘
```

对应的源码（Tomcat 7.0.39，`org.apache.coyote.http11.Http11Processor`，BIO 专属）：

```java
@Override
protected boolean disableKeepAlive() {
    int threadRatio = -1;
    int maxThreads, threadsBusy;
    if ((maxThreads = endpoint.getMaxThreads()) > 0
            && (threadsBusy = endpoint.getCurrentThreadsBusy()) > 0) {
        threadRatio = (threadsBusy * 100) / maxThreads;
    }
    // 线程紧张时直接停掉 keep-alive
    return threadRatio > getDisableKeepAlivePercentage();   // 默认 75
}
```

这解释了所有观察到的现象：

| 现象 | 解释 |
|------|------|
| **随机性** | 忙线程占比在 75% 线上下抖动，过线的那一刻建立/复用的连接就中招 |
| **<10 次请求就关闭** | 不是 maxKeepAliveRequests 的限制，是线程占用率过线 |
| **200 响应也带 Connection: close** | 判定发生在解析请求之前，跟这次请求的结果完全无关 |
| **`keepAliveLeft=-1`** | `setKeepAliveLeft(0)` 之后再 decrement 的必然结果 |

---

### 第十步：修复验证

修改 `server.xml`，将 BIO 切换为 NIO：

```xml
<!-- 修复前 -->
<Connector port="80" protocol="HTTP/1.1"
           maxHttpHeaderSize="8192" enableLookups="false"
           connectionTimeout="20000" redirectPort="8443" />

<!-- 修复后 -->
<Connector port="80" protocol="org.apache.coyote.http11.Http11NioProtocol"
           maxHttpHeaderSize="8192" enableLookups="false"
           connectionTimeout="20000" redirectPort="8443" />
```

生效有两层原因，第二层才是直接的：

1. NIO 使用 I/O 多路复用，空闲 keep-alive 连接不占 worker 线程，200 个线程可以服务数千条连接，线程占用率从根上降下来了；
2. 更直接的是，NIO 里那条自我保护逻辑**压根不存在**——`Http11NioProcessor` 把它重写成了常量：

   ```java
   // org.apache.coyote.http11.Http11NioProcessor
   @Override
   protected boolean disableKeepAlive() {
       return false;
   }
   ```

   所以只要 connector 换成 NIO，「200 响应 + `Connection: close` + `keepAliveLeft=-1`」这个组合就再也不可能出现，与线程忙不忙无关。

如果因为某些原因必须留在 BIO，也可以只调旋钮兜底：`disableKeepAlivePercentage="100"`（关掉这个自我保护）配合调大 `maxThreads`。但 BIO 一连接一线程的模型本身撑不住长连接场景，切 NIO 才是正解。

**重启后 Connection: close 提前关闭的问题消失。** ✅

---

## 排查中的错误推断

记录排查过程中走过的弯路，供参考：

| # | 错误推断 | 实际情况 |
|---|----------|----------|
| 1 | maxKeepAliveRequests=7 | tcpdump 显示 7 个请求后关闭，最初猜测配置为 7。实际是默认值 100 |
| 2 | Tomcat 高负载自动降低 keepAlive → "源码里没有这个机制" | **这条"错误推断"其实是对的，是我没找到。** 机制确有其物：BIO 专属的 `Http11Processor.disableKeepAlive()`，阈值 `disableKeepAlivePercentage` 默认 75%。当时只翻了请求循环体内的 `keepAlive = false` 赋值点，而它在循环之前 |
| 3 | JSON 解析异常导致 500 | `ServiceAuthority.doVerify()` 中 JSONException 被 try-catch 吞掉，不会冒泡 |
| 4 | 错误状态码是主因 | `statusDropsConnection` 只影响少量出错请求（模式二），主因是 BIO 的线程压力自保护（模式一） |
| 5 | 从 server.xml grep 出来的 `maxThreads="150"` | 那是 **8443 SSL Connector** 的配置，80 端口根本没配这一项，实际走默认值 200 |

---

## 相关知识

### Tomcat BIO vs NIO

| | BIO (`HTTP/1.1`) | NIO (`Http11NioProtocol`) |
|---|---|---|
| **线程模型** | 1 连接 = 1 线程 | I/O 多路复用，线程仅在有数据时使用 |
| **keep-alive 空闲连接** | 占线程 | 不占线程 |
| **maxThreads=200 能服务的连接** | ~200 | 数千 |
| **线程紧张时的行为** | `disableKeepAlive()`：忙线程 > 75% 就停发 keep-alive | 恒 `return false`，无此逻辑 |
| **线程名前缀** | `http-bio-<port>-exec-N` | `http-nio-<port>-exec-N` |
| **适用场景** | 低并发、短连接 | 高并发、长连接 |

### disableKeepAlivePercentage

BIO connector 独有的属性，默认 **75**，可写在 Connector 上：

| 值 | 效果 |
|---|---|
| `75`（默认） | 忙线程占比 > 75% 时，新进入 `process()` 的连接一律不给 keep-alive |
| `100` | 相当于关闭该保护（`threadRatio > 100` 永不成立） |
| `0` | 只要有忙线程就不给 keep-alive |

setter 会把入参裁剪到 `[0, 100]`。切到 NIO / APR 之后这个属性不再起任何作用。

### statusDropsConnection 触发条件

以下状态码会触发 Tomcat 关闭 keep-alive 连接（`AbstractHttp11Processor.statusDropsConnection()`，BIO / NIO 通用）：

`400` · `408` · `411` · `413` · `414` · `500` · `501` · `503`

---

## 续：切换 NIO 之后剩余的短连接分析（2026-06-08）

切换到 `Http11NioProtocol` 之后，原先大量"建连即关闭"的 syn/fin 对显著减少，但仍能观察到一部分 TCP 连接生命周期很短、只承载一个请求就被关掉。再次抓包分析。

### 抓包时间轴

```
# tcpdump -nn -r /tmp/10.115.39.142.dump -A 'port 46160'
```

| 时刻 | 事件 |
|------|------|
| 18:45:38.844133 | client SYN |
| 18:45:38.844242 | 三次握手完成 |
| 18:45:38.844259 | client 发出 `POST /api/CMSGetServer/?_version=new` |
| 18:45:38.854101 – .854188 | server 分多段返回 200 OK（chunked） |
| 18:45:38.854253 | client ACK 最后一段 |
| **18:45:59.233153** | **server 主动发 FIN** |
| 18:45:59.233264 | client 回 FIN-ACK |

请求侧关键信息：
- `User-Agent: Java/25`
- 没有 `Connection: close`
- HTTP/1.1
- 响应 200 OK，无 `Connection: close`

### 关键差异

这个连接**并不是"建连后立刻 finish"**：
- 实际存活 **20.379 秒**
- **server 端（10.108.4.10:80）先发 FIN**
- 期间只承载 1 个 HTTP 请求

20.4 秒几乎一定是 Tomcat 的 **`keepAliveTimeout`** 计时器到期。本机 Connector 没有显式配 `keepAliveTimeout`，这种情况下 `AbstractEndpoint.getKeepAliveTimeout()` 会回落到 `soTimeout`，也就是 Connector 上配的 `connectionTimeout` —— 本机是 **20000ms**，与抓包 idle 时长完全吻合。

（注意这里的 20s 来自 server.xml 里写死的 `connectionTimeout="20000"`，不是 Tomcat 的出厂默认；Tomcat 自身 `connectionTimeout` 的默认值是 60000ms。）

也就是说，**server 这一侧的行为是完全正常的**：HTTP/1.1 keep-alive，连接处理完一个请求后空闲 20s 没有新请求，服务端按配置主动回收。

### 真正异常的地方在 client 侧

这条连接只承载 1 个请求就被晾在那里 20s 等回收，相当于"用一次就丢"。这才是切换 NIO 后剩余 syn/fin 对偏多的根本原因——**client 没有复用连接**。

可能的原因：

1. **`User-Agent: Java/25` 是 `java.net.HttpURLConnection` 的默认 UA**（Apache HttpClient / OkHttp 都会换成自己的 UA）。`HttpURLConnection` 的 keep-alive 复用条件很苛刻：
   - 必须把响应 `InputStream` 完整读到 EOF 并 close
   - 不能调用 `disconnect()`（直接关流）
   - `http.maxConnections`（默认 5）和 `http.keepAlive=true` 都得满足
   - 任何一个条件不满足，连接就不进 `KeepAliveCache`
2. **请求频率与超时不匹配**：如果调用方是定时任务/批处理（> 20s 一次），无论池子做得多好，下一次请求来时连接已被回收
3. **短生命周期 JVM**：CLI / Job 进程退出时连接池一起销毁，等价于每次都新建

### 排查方向

| 优先级 | 方向 | 说明 |
|--------|------|------|
| 高 | 确认 client 是谁、用什么 HTTP 库 | 10.115.39.142 上跑的什么应用？是 `HttpURLConnection` / Apache HttpClient / OkHttp / `RestTemplate`？是否启用连接池 |
| 高 | 看请求间隔分布 | server 侧按源 IP+UA 聚合：P50 间隔 > 20s 时再优化复用也救不了 |
| 中 | server 侧调大超时（兜底） | `keepAliveTimeout="60000"`、`maxKeepAliveRequests="-1"`；权衡 worker/socket 资源 |
| 中 | client 改造（`HttpURLConnection`） | 避免 `disconnect()`、完整消费响应体；或改造为 Apache HttpClient / OkHttp + `PoolingHttpClientConnectionManager` |
| 低 | 验证 | 抓同一 client 的连接序列，看是否在打开新连接前已有可复用的 ESTABLISHED 连接 |

### 小结

| | 第一次排查（BIO） | 续：NIO 之后剩余的短连接 |
|---|---|---|
| 现象 | 200 响应也带 `Connection: close` | 响应不带 `Connection: close`，但连接只用 1 次 |
| 触发方 | server (Tomcat 自保护) | server (keep-alive timeout) |
| 时间特征 | 一条连接处理 < 10 个请求即关闭 | 单请求 + 20s 空闲 + server FIN |
| 根因 | BIO 的 `disableKeepAlive()` 线程压力自保护 | client 没有复用连接 |
| 修复方向 | server 侧切 NIO | client 侧用连接池；server 侧调大 `keepAliveTimeout` 兜底 |

---

## 勘误（2026-08-27 复核）

初版有几处事实错误。这次是拿**生产机上正在跑的那份 jar 和 server.xml** 逐条核对的，不是凭记忆：

```bash
# Tomcat 版本
java -cp /usr/local/osg/lib/catalina.jar org.apache.catalina.util.ServerInfo
#   Server version: Apache Tomcat/7.0.39   ← 与原文一致

# 反编译 BIO / NIO 的 processor
unzip -o -q -d /tmp/tc /usr/local/osg/lib/tomcat-coyote.jar 'org/apache/coyote/http11/Http11*.class'
javap -p -c -cp /tmp/tc org.apache.coyote.http11.Http11Processor
javap -p -c -cp /tmp/tc org.apache.coyote.http11.Http11NioProtocol
```

| # | 初版写的 | 实际 | 影响 |
|---|---------|------|------|
| 1 | "查阅源码未找到 Tomcat 高负载降级 keepAlive 的机制" | 机制存在：BIO 的 `Http11Processor.disableKeepAlive()`，阈值 `disableKeepAlivePercentage` 默认 **75**（在 `Http11Protocol` 构造函数里 `bipush 75`）。调用点在 `AbstractHttp11Processor.process()` 进入请求循环**之前**：`if (disableKeepAlive()) socketWrapper.setKeepAliveLeft(0);` | **最严重**。结论方向没错，但把唯一的直接证据说成了"查无此物"，读者无法复现推理 |
| 2 | `maxThreads="150"` | 80 端口 Connector 没有这一项，走默认 **200**。文件里的 `maxThreads="150"` 属于 8443 SSL Connector 和一段被注释掉的 Executor | 阈值算错：触发点是 200×75% = **150 个忙线程**，不是"第 151 个连接" |
| 3 | `maxKeepAliveRequests="1000"` | server.xml 里**根本没有这个属性**，走默认 **100** | 连带使模式二日志里的 `keepAliveLeft=993` 不可信（默认值下上限是 99） |
| 4 | `ss -tnp \| grep :80 \| wc -l` = 388 当作入向连接数 | 该 grep 把出向到后端 `:80`/`:8080` 的连接也算进去了（`":8080"` 含 `":80"`）。OSG 出向建连约 280 次/秒，量级足以主导这个数 | 388 这个数本身不成立；应 `ss -tan state established '( sport = :80 )'` |
| 5 | "Tomcat NIO 默认 keepAliveTimeout = connectionTimeout = 20000ms" | `keepAliveTimeout` 未配置时回落到 `soTimeout` 这点是对的，但 **20000 来自本机 server.xml 的显式配置**；Tomcat 出厂默认是 60000（`Http11NioProtocol` 构造函数里 `setSoTimeout(60000)`） | 措辞误导，结论不受影响 |

结论本身（BIO → NIO）经受住了复核，而且理由比初版更硬：NIO 的 `Http11NioProcessor.disableKeepAlive()` 是常量 `return false`，这条路径在 NIO 下不存在。

一句话教训：**`grep` 配置文件时，命中的行属于哪个 Connector、是不是在注释里，得先确认**——第 2、3 条都是这么来的，而且它们一路撑到了最终结论里没被质疑。
