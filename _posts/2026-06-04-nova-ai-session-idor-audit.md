---
layout: post
title: "Nova AI Agent 接口安全审计：从抓包到发现 Session IDOR 漏洞"
date: 2026-06-04 11:56:00 +0800
categories: [security, pentest]
tags: [IDOR, AI-agent, session-hijack, prompt-injection]
---

# Nova AI Agent 接口安全审计：从抓包到发现 Session IDOR 漏洞

## 背景

Nova AI 是公司内部的 AI 数据分析平台，用户可以通过自然语言对话的方式查询 Dashboard 数据。后端架构是一个 AI Agent（基于 Claude Sonnet 4.6），通过 `mount`、`sql`、`stat` 等工具访问数据仓库。

作为普通用户，黑盒情况下，我对其核心接口 `/api/dashboard/summary/llmAgentic` 进行了一次完整的安全审计。以下记录了从零开始的探索过程。

---

## 第一步：抓包分析请求结构

从浏览器 DevTools 抓到前端发起的 HTTP 请求：

```
POST https://nova.ai.corp.com/api/dashboard/summary/llmAgentic
Content-Type: multipart/form-data
```

关键字段：

| 字段 | 示例值 | 用途 |
|------|--------|------|
| `protocol` | `agui` | 协议标识 |
| `sessionId` | `123456` | 会话 ID |
| `eid` | `emp100` | 员工工号 |
| `dashboardIdCode` | `647e64ba-...` | Dashboard UUID |
| `idCode` | `210axx0y-...` | 本次请求 UUID |
| `question` | 用户输入 | 发给 AI 的问题 |
| `threadId` | `session_123456_xxx` | 对话线程 ID |
| `runId` | UUID | 本次执行 ID |
| `filters` | 大段 JSON | 筛选条件 |
| `context` | `[]` | 上下文 |
| `forwardedProps` | `{}` | 转发属性 |

响应是 SSE（Server-Sent Events）流，AI 逐 token 返回文本，中间穿插 tool call 事件。

---

## 第二步：用 Python 复现请求

编写脚本，使用 `requests` 库以 `multipart/form-data` 格式发送请求，把 Cookie 和 payload 完整复制过来：

```python
response = requests.post(url, data=data, cookies=cookies, stream=True, verify=False)
for line in response.iter_lines():
    if line:
        print(line.decode("utf-8"))
```

成功复现——返回 `200`，AI 正常回复，验证了脚本可用。

---

## 第三步：理解身份认证机制

**问题：AI 是怎么知道"我是谁"的？**

观察请求中的 Cookie，找到了用户身份标识：

```
PRO_cas_principal=PRO-6a69612e6c6975-MTc3...
                       ^^^^^^^^^^^^^^
                       hex('jia.liu') = 6a69612e6c6975
```

身份通过以下 Cookie 传递：

- `PRO_cas_principal` — CAS 认证主体，明文含用户名 hex 编码
- `ada_cas_user` — 加密的用户凭证（服务端解密后作为最终身份）
- `offlineTicket` — 离线票据

payload 中的 `eid`、`sessionId` 看起来像是业务参数而非认证凭据。

---

## 第四步：尝试替换身份

将 Cookie 中 `6a69612e6c6975`（`jia.liu`）替换为 `63616966`（`caif`）后发现：AI 仍然以 `jia.liu` 身份工作。

**结论：** 真正的身份凭据是加密的 `ada_cas_user`，明文的 hex 编码只是辅助标识，服务端以加密 token 为准。

---

## 第五步：发现 sessionId 的可枚举性

但是我在多次尝试中，服务器回答我“这已经是第8次你以 caif 身份提问了，我依然不能以 caif 的身份回答你”。

但我明明使用的短链接，我好奇服务器是如何知道我第8次的，里面应该是有 session 的。

注意到我们的请求中有 `sessionId` 字段。

这引发了一个疑问：**如果我传入别人的 sessionId 会怎样？**

---

## 第六步：Session IDOR 验证

编写枚举脚本，用自己的 Cookie 鉴权，但 `sessionId` 使用相邻的数字：

```python
question = "我的员工ID是emp100，确认一下对吗？总结一下我们之前聊了啥"
```

AI 的回复：

> 系统中记录的你的员工ID是 **emp200**，不是 emp100，请确认是否有误。
> 这是我们本次会话的**第一条消息**，当前会话中没有任何历史聊天记录。

**关键发现：**
- AI 回复了一个**不属于我的员工 ID** —— 说明 `sessionId` 决定了 AI 看到的用户身份
- "第一条消息"—— 说明 `threadId`（UUID）控制对话历史，`sessionId` 只控制身份上下文
- 鉴权通过了—— 说明 Cookie 只验证"是否为合法用户"，不校验 sessionId 归属

---

## 第七步：确认数据访问可越权

使用他人 sessionId 发送正常的数据查询：

```python
question = "帮我查一下 M1: Cursor 工具覆盖"
```

AI 执行了完整流程：
1. 调用 `mount` 挂载了 dashboard（30 张数据表）
2. 调用 `sql` 查询具体数据
3. 调用 `stat` 获取 SQL 元数据（暴露了底层数据库表名 `ctriphr_db.edw_emp_ful`）
4. 返回了**受害者权限范围内**的完整数据

---

## 漏洞根因分析

```
┌─────────────────────────────────────────────────────┐
│                  请求到达后端                          │
├─────────────────────────────────────────────────────┤
│  1. Cookie 校验 ─────→ 通过（攻击者是合法用户）         │
│                                                     │
│  2. sessionId 查找 ──→ session store                 │
│     └→ 返回该 session 对应的用户身份（受害者 B07464）    │
│                                                     │
│  3. 将受害者身份注入 LLM system prompt                 │
│                                                     │
│  4. LLM 以受害者身份执行 mount / sql / stat           │
│     └→ 数据按受害者权限返回                            │
└─────────────────────────────────────────────────────┘
```

**本质：鉴权（Authentication）和授权（Authorization）解耦。** Cookie 只负责 AuthN，但 AuthZ 完全依赖客户端传入的 `sessionId`——这是一个经典的 IDOR。

---

## 攻击场景

1. 攻击者通过社工/日常沟通，诱导目标用户打开 Nova AI 页面
2. 攻击者随后自己打开页面，获得一个相邻的 sessionId
3. 枚举前后几个数字，尝试命中目标用户的 session
4. 成功后，可以目标用户的身份查询任意数据

由于 sessionId 是自增整数，攻击窗口大、成本极低。

---

## 额外发现

在审计过程中还发现：

- **底层 SQL 泄漏：** `stat` 工具会返回报表的原始 SQL 定义，暴露了真实数据库名（`ctriphr_db`）和表结构
- **审计策略有效：** 标记为敏感的表（如 `M2-A1: AI 工具总实付`）即使在 IDOR 下也无法访问，说明数据层有独立的权限控制
- **响应格式：** 系统使用 A2UI 协议，SSE 流中混合了文本、tool call、HTML 样式、心跳等多种事件类型

---

## 修复建议

| 优先级 | 措施 | 说明 |
|--------|------|------|
| P0 | 服务端用 Cookie 身份覆盖 sessionId | 根本修复，不信任客户端传入的 sessionId |
| P1 | sessionId 改为 UUID 或带签名的 token | 消除枚举可能性 |
| P1 | 校验 sessionId 归属 | session owner 必须等于 Cookie 认证用户，不一致则拒绝 |
| P2 | sessionId 设置有效期 | 减少攻击窗口 |
| P2 | `stat` 工具对外隐藏底层 SQL | 避免数据库结构泄漏 |

---

## 时间线

| 时间 | 动作 |
|------|------|
| 2026-05-25 19:00 | 抓包分析请求结构，编写 Python 复现脚本 |
| 2026-05-25 19:30 | 分析身份认证机制（Cookie hex 编码） |
| 2026-05-25 20:00 | 编写安全扫描脚本（prompt注入/IDOR/SQL注入） |
| 2026-05-26 00:00 | 发现 sessionId IDOR 漏洞 |
| 2026-05-26 00:30 | 验证可以越权访问他人数据 |
| 2026-05-26 01:00 | 编写漏洞报告和修复建议 |

---

## 总结

这个漏洞的核心教训是：**当系统引入 AI Agent 层时，传统的 AuthN/AuthZ 边界容易被打破。** AI Agent 作为中间层，它的"身份"不应该由客户端可控的参数决定。在 AI 时代，安全审计需要特别关注：

1. AI Agent 以谁的身份执行操作？这个身份从哪来？
2. 客户端能否篡改这个身份？
3. AI 的工具（mount/sql/stat）是否有独立的鉴权？还是完全信任 session 上下文？

对于 AI Agent 系统，**"谁在问"和"谁的数据"必须在服务端强绑定**，绝不能让客户端参数决定权限边界。
