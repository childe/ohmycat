---

date: 2022-03-29T11:10:15+0800
title: harbor 中 oidc 认证的一些笔记

---


使用版本是 harbor v2.2.0。本文只是记录了一些 OIDC 认证相关的东西。需要事先了解一些 SSO 知识和 [Docker HTTP V2 API](https://docs.docker.com/registry/spec/api/)

Harbor Core 组件分两个比较独立的功能，一个是提供 Token 服务，一个是反向代理后面的 Registry 。两者都有和 OIDC 打交道的地方。

Harbor 中使用 OIDC 的地方，大的来说有两个。一个是 Web 页面登陆的时候，一个是 docker login/pull/push 时的身份认证。

数据库里面和 OIDC 相关的一个重要表是  oidc\_user，里面有两个重要的列，一个 secret，也就是密码，另外一个是 token，用来做验证（比密码更多一层安全？）。

<!--more-->

## Harbor 的权限认证机制

所有请求会通过几个 Middleware，`beego.RunWithMiddleWares("", middlewares.MiddleWares()...)` ，这里面有一个Middleware 是 security Middleware。这个security Middleware 会依次使用 secret oidcCli v2Token ... basicAuth session 等模块验证，有一个成功就可以成功返回(会同时把用户信息写到 Request Context 里面)。

**这里注意一下，docker cli 过来的 BasicAuth 请求会在 oidcCli 里面做验证，而不是 basicAuth**

## OIDC 服务元数据

配置 OIDC 服务后，会调用 https://OIDC.COM/.well-known/openid-configuration 来获取一些元数据信息。类似下面这样：
```json
{
  "response_types_supported": [
    "code"
  ],
  "claims_supported": [
    "sub",
    "name",
    "dept",
    "empCode",
    "mail",
    "eid"
  ],
  "jwks_uri": "https://OIDC.COM/.well-known/jwks.json",
  "subject_types_supported": [
    "public"
  ],
  "id_token_signing_alg_values_supported": [
    "RS256"
  ],
  "scopes_supported": [
    "openid"
  ],
  "response_modes_supported": [
    "query"
  ],
  "issuer": "https://OIDC.COM",
  "authorization_endpoint": "https://OIDC.COM/oidc/authorize",
  "token_endpoint": "https://OIDC.COM/oidc/authorize/token",
  "userinfo_endpoint": "https://OIDC.COM/oidc/userinfo"
}
```


## 用户页面登陆 Harbor

后端的核心流程，也就是下面的取 Token 和验证，在 src/core/controllers/oidc.go:Callback 里面。

0. SSO 那一套跳转，略
1. 拿到 OIDC 服务跳转带过来的 Code 值
2. 拿 Code 值去 OIDC 服务取 Token。
3. 验证 Token 是不是合法。（后面详说）
4. 将 Token Json 处理，更新为数据库里面的 oidc\_user 的 token 字段(docker login 等会用到)。

## docker login 流程

从 docker client 方面讲：

1. docker cli 访问 https://HUB.COM/v2/
2. hub 服务端返回 401，同时，Header 里面包含 `Www-Authenticate: Bearer realm="https://TOKEN.COM/service/token",service="harbor-registry"`
3. docker cli 使用 Basic Auth 去 `https://TOKEN.COM/service/token` 请求一个 Token
4. 拿 Token 再次访问 `https://HUB.COM/v2/`

那从 harbor 方面看呢：
1. 处理 BasicAuth 来取 Token 的请求时，使用 oidcCli 来做验证
    1. 到数据库里面取 oidc\_user 的密码，使用 Key Decode 之后，看和用户输入是不是匹配
    2. 取 oidc\_user 里面的 Token 值
    3. Decode Token 数据，获得用户信息，比如用户名等。这一步会对 Token 做合法性的验证(下面详说)。
    4. 调用前文所说的 userinfo\_endpoint，获取用户信息
2. 处理带 Token /v2/ 请求时：使用 v2Token。拿 Header 里面的 Bearer 值，用来 Decode 成 Token。这个 Token 里面是包括用户信息的，包括用户名。这个时候用户名会存到 Request Context 里面。(看代码中，这一步骤是不会做 Token 验证的。默认他是合法的。不太确定了。）


## Token 验证

稍微详细说一下 Token 怎么验证合法性。通过 Decode Token 拿 UserInfo 的时候会做 Token 合法性的验证，如果失败，整个 Request 就返回 401 了。

这个验证逻辑在 src/common/utils/oidc/helper.go 里面，`return verifier.Verify(ctx, rawIDToken)`，是对 Token.rawIDToken 做合法性的验证。

```go
parts := strings.Split(token.RawIDToken, ".")

rawProtected, err := base64.RawURLEncoding.DecodeString(parts[0])
payload, err := base64.RawURLEncoding.DecodeString(parts[1])
signature, err := base64.RawURLEncoding.DecodeString(parts[2])

protected := make(map[string]string)
json.Unmarshal(rawProtected, &protected)
kid := protected["kid"]
```

以上代码中，payload 就包含了用户信息，比如用户名等。

验证是通过 public key 对 rawIDToken 做 Hash，如果和 signature 匹配，则验证成功。

那 public key 哪里来的呢？是通过上方提到的 jwks_uri 来获取一个 keys 列表，遍历找到 kid 和 上面代码中 kid 相同的那一个，里面包含了加密算法，PublicKey 等信息。


通过以上可以看出，Harbor 要改 OIDC 服务地址是一个破坏性的工作，会导致用户认证失败。首先，Kid 就匹配不到。如果强行修改 Kid，会导致 signature 验证失败。
