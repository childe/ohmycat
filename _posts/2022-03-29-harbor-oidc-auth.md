---

layout: post
date: 2022-03-29T11:10:15+0800
title: harbor 中 oidc 认证的一些笔记

---


使用版本是 harbor v2.2.0。本文只是记录了一些 OIDC 认证相关的东西。需要事先了解一些 SSO 知识和 [Docker HTTP V2 API](https://docs.docker.com/registry/spec/api/)

Harbor Core 组件分两个比较独立的功能，一个是提供 Token 服务，一个是反向代理后面的 Registry 。两者都有和 OIDC 打交道的地方。

Harbor 中使用 OIDC 的地方，大的来说有两个。一个是 Web 页面登陆的时候，一个是 docker login/pull/push 时的身份认证。

数据库里面和 OIDC 相关的一个重要表是  oidc\_user，里面有两个重要的列，一个 secret，也就是密码，另外一个是 token，用来做验证（比密码更多一层安全？）。

