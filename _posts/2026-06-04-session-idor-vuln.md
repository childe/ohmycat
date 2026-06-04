---
layout: post
title: "Nova AI Agent — Session IDOR 漏洞报告"
date: 2026-06-04 10:00:00 +0800
tags: [security, IDOR, vulnerability]
---

## 漏洞概述

**漏洞类型：** IDOR（Insecure Direct Object Reference，不安全的直接对象引用）  
**影响接口：** `POST https://nova.ai.schedule.ops.ctripcorp.com/api/dashboard/summary/llmAgentic`  
**严重程度：** 高  
**发现日期：** 2026-05-26  

---

## 漏洞原理

系统在处理请求时，**身份鉴权**和**数据访问身份**使用了两套独立的机制：

| 机制 | 字段 | 用途 | 是否可被篡改 |
|------|------|------|------------|
| 身份鉴权 | Cookie（`PRO_cas_principal`、`ada_cas_user`） | 验证请求者是否为合法用户 | 否（加密签名） |
| 数据访问身份 | `sessionId`（请求 payload 中） | 确定 LLM 以哪个用户的身份访问数据 | **是** |

服务端逻辑伪代码：

```
1. 校验 Cookie → 通过（你是合法用户）
2. 读取 payload.sessionId → 从 session store 查找该 session 对应的用户
3. 将该用户身份注入 LLM system prompt
4. LLM 以该用户身份 mount dashboard、执行 SQL 查询
```

Cookie 验证只保证"请求者已登录"，但 LLM 实际操作数据时用的是 `sessionId` 对应的用户身份，两者完全解耦。

---

## 漏洞特征

### sessionId 是自增整数

经实测，`sessionId` 为简单自增整数（如 `664663`、`664664`、`665799`...），没有任何随机性或签名保护。

### 攻击者可精准定位受害者的 sessionId

攻击者可以通过以下步骤获取目标用户的 sessionId：

1. 诱导目标用户打开 Nova AI 聊天页面（触发 session 创建）
2. 攻击者自己立即打开聊天页面，记录自己的 sessionId（例如 `665805`）
3. 由于两次操作时间相近，目标用户的 sessionId 必然在攻击者 sessionId 附近（前后几个数字）
4. 枚举尝试 `665800`～`665810` 等几个相邻值，即可命中目标 session

---

## 实测验证

测试请求示意：

```http
POST /api/dashboard/summary/llmAgentic
Cookie: <攻击者自己的合法 Cookie>

sessionId=664664   ← 受害者的 sessionId（攻击者的 Cookie）
question=我的员工ID是xxx，确认一下对吗？
```

**实测响应：**

```
系统中记录的你的员工ID是 B07464，不是 xxx
```

LLM 明确返回了受害者的真实员工 ID，**证实身份已被替换**。

进一步利用：挂载受害者有权限的 dashboard 并执行数据查询，可读取受害者能访问的所有数据，包括团队人员、KPI、AI工具使用明细等。

---

## 影响范围

- 可冒充任意已登录用户进行数据查询
- 受害者的 dashboard 数据（含团队组织、人员 KPI、工具使用情况）可被完整读取

---

## 修复建议

### 根本修复

服务端在处理请求时，**用 Cookie 解析出的用户身份覆盖 sessionId 对应的用户身份**，而不是信任客户端传入的 `sessionId`：

```python
# 错误做法（当前实现）
user = session_store.get(request.sessionId)

# 正确做法
user = auth.resolve_from_cookie(request.cookies)  # 从 Cookie 解析，不信任客户端
session_store.bind(request.sessionId, user)        # 可选：校验 sessionId 与 Cookie 用户是否一致
```

### 辅助加固

1. **sessionId 使用 UUID 或带签名的随机值**，而非自增整数，消除枚举可能性
2. **服务端校验 sessionId 归属**：若 `sessionId` 对应的用户与 Cookie 认证用户不一致，直接拒绝请求（返回 403）
3. **限制 sessionId 的有效期**，减少窗口期
