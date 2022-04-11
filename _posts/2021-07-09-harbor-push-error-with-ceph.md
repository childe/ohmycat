---

layout: post
date: 2021-07-09T13:06:35+0800
title: harbor push image 时偶尔出错的定位

---

harbor 后端使用 Ceph 做存在，前端加 Swift 一层（应该是因为 registry 不直接支持 Ceph吧，这块还不是特别了解。）

最近一段时间发现偶尔有 push image 出错。看 registry.log 是因为 PutContent 失败。 查 Ceph Access 日志，是 401 报错，接着一个 400 报错。

<!--more-->

我觉得，写一篇这样的文章有两个用，一个是做一个记录,给自己留下一些回忆，另外一个作用是能帮助到遇到类似问题的人。

但这两个又是冲突的，如果按前者来，会记录到很多无用的细节，走过的偏路，对后者是一个干扰。而且要还原当时的所有的路径已经有很大难度了，根本记不清当时先做了哪些尝试，又为啥放弃的。哪怕是记得，也不适合婆婆妈妈的写到这里来。

干脆直接写简单点，写个结论吧。

## registry.log

看一下 registry.log 的相关日志

> Jul  6 10:11:30 192.168.0.1 registry[8230]: time="2021-07-06T02:11:30.992927436Z" level=debug msg="swift.PutContent("/docker/registry/v2/repositories/xxxxx\_project/xxxxxx\_reponame/100031678/\_uploads/75153ea5-fafe-4200-914f-9429f9ee97ff/startedat")" auth.user.name="harbor\_registry\_user" go.version=go1.15.6 http.request.host=corp.com http.request.id=xxxxxxxxx http.request.method=POST http.request.remoteaddr=10.0.0.1 http.request.uri="/v2/xxxxx\_project/xxxxxx\_reponame/blobs/uploads/" http.request.useragent="docker/19.03.12 go/go1.13.10 git-commit/48a66213fe kernel/4.19.118-1.el7.centos.x86\_64 os/linux arch/amd64 UpstreamClient(Docker-Client/19.03.12 (linux))" trace.duration=94.792947ms trace.file="/go/src/github.com/docker/distribution/registry/storage/driver/base/base.go" trace.func="github.com/docker/distribution/registry/storage/driver/base.(\*Base).PutContent" trace.id=xxxxxxxxx trace.line=110 vars.name="xxxxx\_project/xxxxxx\_reponame"
> Jul  6 10:11:30 192.168.0.1 registry[8230]: time="2021-07-06T02:11:30.993014128Z" level=error msg="response completed with error" auth.user.name="harbor\_registry\_user" err.code=unknown err.detail="swift: Put "http://corp.com/swift/v1/harbor/files/docker/registry/v2/repositories/xxxxx\_project/xxxxxx\_reponame/\_uploads/75315e5a-afef-4002-491f-ee9f7f94f299/startedat": net/http: HTTP/1.x transport connection broken: http: ContentLength=20 with Body length 0" err.message="unknown error" go.version=go1.15.6 http.request.host=corp.com http.request.id=xxxxxxxx http.request.method=POST http.request.remoteaddr=10.0.0.1 http.request.uri="/v2/xxxxx\_project/xxxxxx\_reponame/blobs/uploads/" http.request.useragent="docker/19.03.12 go/go1.13.10 git-commit/48a66213fe kernel/4.19.118-1.el7.centos.x86\_64 os/linux arch/amd64 UpstreamClient(Docker-Client/19.03.12 (linux))" http.response.contenttype="application/json; charset=utf-8" http.response.duration=98.515653ms http.response.status=500 http.response.written=303 vars.name="xxxxx\_project/xxxxxx\_reponame"

里面有一段错误详情：`net/http: HTTP/1.x transport connection broken: http: ContentLength=20 with Body length 0"`。这是 Golang Http 库里面的报错，意思是，header 里面的 content-length 是20，但 Body 长度却是0。

结合 Ceph Access 日志那边的400 报错，其实应该能反应过来：是请求 Ceph 的时候，Body 为空了。

但可惜，我自己对这个没有太敏感，直接忽略掉了。一直纠结在 Ceph Access 日志中 401 的报错上面，着重去查了为啥出现 401。

## registry 代码(其实是调用到 swift 代码)

翻阅了 registry 的代码，其实是又调用到 [swift 库](https://github.com/ncw/swift) 这里来了。

既然有 401，那先查一下认证机制。

像 registry/config.yml 里面配置的 swift 信息，包括 user password tenant authurl 等信息，这些被拿来请求 authurl/tokens，返回了 token(一般还会带 expire 时间)，以及后面真正的存储服务的 URL。

这个存储的 URL 调用请求会到 [swift.Call](https://github.com/ncw/swift/blob/v2.0.0/swift.go#L708) 这个方法里面来。

Call 里面还会检查 token 是不是合法（如果 token 离到期时间不到1分钟了，会被认为不合法，留一个缓冲的时间），如果不合法了会请求 /tokens 更新 token。

所以这套逻辑看下来，不像会发生 401。

## Ceph 日志

> 2021-07-06 10:11:30.901510 7ff4ddc6f700  1 ====== starting new request req=0x7ff4ddc68f90 =====
> 2021-07-06 10:11:30.902870 7ff4ddc6f700  0 got expired token: admin:swift expired: 1625537489
> 2021-07-06 10:11:30.902982 7ff4ddc6f700  1 ====== req done req=0x7ff4ddc68f90 op status=0 http\_status=401 ======
> 2021-07-06 10:11:30.903021 7ff4ddc6f700  1 civetweb: 0x55f773b60000: 127.0.0.1 - - [06/Jul/2021:10:11:27 +0800] "PUT /swift/v1/harbor/files/docker/registry/v2/repositories/xxxxx\_project/xxxxxx\_reponame/\_uploads/75315e5a-afef-4002-491f-ee9f7f94f299/startedat HTTP/1.1" 401 0 - distribution/v2.7.1.m

非常明确，Ceph 说这个 token 过期了。

想了很久，没想明白为啥会过期。也怀疑过是不是有机器的时间和其他机器不一样。但查下来并没有这个现象。

## Auth 服务日志

Swift 请求的 Authrul 是另外一个应用提供的服务，又去查了它的Access 日志。有一个值得注意的现象，当时没有多想：在出错的那个时间点上，有两条 /tokens 请求。

## 再次到 Swift 代码中确认为啥 PutContent 失败

再次翻看 swift 库代码，如果是 401 的话，的确会有重试，而且默认是重试三次，这个次数的配置也没有被覆盖，感觉重试之后应该能成功的，就算不成功，日志里面应该也会有重试三次的日志吧。有些不知所措了。

## 柳暗花明


去 google 了一下 `net/http: HTTP/1.x transport connection broken: http: ContentLength=20 with Body length 0"` 这个报错，知道了他的意思。

然后赶紧去代码里面翻看哪里有可能触发这个问题，还真的很快找到了。

[swift.Call](https://github.com/ncw/swift/blob/v2.0.0/swift.go#L708) 这里在重试的时候，使用 io.Reader 去传递 request.Body，但是这是一个流啊，第一次请求的时候已经被读完了，retry 的时候不会读到任何数据了。所以就触发了这个报错。提了一下 [PR]([fix: empty http request body in Connection.Call by childe · Pull Request #171 · ncw/swift (github.com)](https://github.com/ncw/swift/pull/171)。

## Ceph 为啥会 401

照理说，Ceph 这边不应该有 401 报错。

照着缓存的思路去搜索了一下，还真找到一个别人提过的 [Bug #21226: Expired Keystone Tokens not removed from Cache - rgw - Ceph](https://tracker.ceph.com/issues/21226)，可能就是原因所在吧。
