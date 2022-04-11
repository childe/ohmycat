---

layout: post
date: 2022-04-08T18:19:23+0800

---

最近几天 Harbor 出现比较多的 500 错误，引发告警。排查一下原因。

## registry.log 里面的错误日志

> Apr  6 11:46:40 172.25.0.1 registry[3915]: time="2022-04-06T03:46:40.800755496Z" level=error msg="response completed with error" auth.user.name="harbor_registry_user" err.code=unknown err.detail="s3aws: Path not found: /docker/registry/v2/repositories/gitlab-ci/100017681/_uploads/9ac3ea44-cbb6-4a1b-8048-6e59767c7370/data" err.message="unknown error" go.version=go1.15.6 http.request.host=hub.cloud.ctripcorp.com http.request.id=5bfcac34-34fa-4a05-ae52-b3fbb3714de2 http.request.method=PATCH http.request.remoteaddr=10.109.6.219 http.request.uri="/v2/gitlab-ci/100017681/blobs/uploads/9ac3ea44-cbb6-4a1b-8048-6e59767c7370?_state=YmUOEA6F6k5OZsTu9CyQfl5CRNqlVEvx7XKgf_BVqLl7Ik5hbWUiOiJnaXRsYWItY2kvMTAwMDE3NjgxIiwiVVVJRCI6IjlhYzNlYTQ0LWNiYjYtNGExYi04MDQ4LTZlNTk3NjdjNzM3MCIsIk9mZnNldCI6MCwiU3RhcnRlZEF0IjoiMjAyMi0wNC0wNlQwMzo0NjozNi4yNTQ4MzA2MzRaIn0%3D" http.request.useragent="docker/17.09.0-ce go/go1.8.3 git-commit/afdb6d4 kernel/4.19.118-1.el7.centos.x86_64 os/linux arch/amd64 UpstreamClient(Docker-Client/17.09.0-ce (linux))" http.response.contenttype="application/json; charset=utf-8" http.response.duration=2.255332326s http.response.status=500 http.response.written=203 vars.name="gitlab-ci/100017681" vars.uuid=9ac3ea44-cbb6-4a1b-8048-6e59767c7370

## 看代码梳理一下 docker push 的流程

Docker Cli 这边 upload blob 的流程是：

1. docker cli 调用 POST /v2/<name>/blobs/uploads/  获取 uuid
2. docker cli 调用 PATCH /v2/<name>/blobs/uploads/<uuid>


着重翻代码看一下 Registry 这边对这两个操作的对应的处理流程：

1. buh.StartBlobUpload
    1. 调用到 s3.Writer(ctx context.Context, path string, append bool)。append = false
    2. 调用到 d.S3.CreateMultipartUpload
    3. 生成一个 UUID
    4. 调用 S3 接口 Create 一个 Object。`POST /{Bucket}/{Key+}?uploads`
    5. TLDR: 在 S3 创建一个对象，然后生成一个 UUID 并返回给 Client。
2. buh.PatchBlobData
    1. 调用到 bub.ResumeBlobUpload
    2. 调用到 blobs.Resume(buh, buh.UUID)
    3. 调用到 s3.Writer(ctx context.Context, path string, append bool)。append = true
    4. `for _, multi := range d.S3.ListMultipartUploads{}` 。遍历失败，返回 storagedriver.PathNotFoundError
    5. TLDR: 按 UUID 找到对应的对象，然后写数据进去。


流程看起来问题不大，先创建对象，然后写数据。问题出在，第一步里面调用的 S3 创建对象是异步处理的，第二步请求来的时候，对象还没有创建好。

## 日志验证

通过看 S3 的 Harbor 的日志，基本上可以确定这个问题了。但还没有在代码层面看到**异步**的证据。应该是需要看 S3 SDK，一时看不动了。

我们拿一个出错的请求，来通过日志确认一下。

请求在 registry.log 里面的日志如下：

```
Apr  6 11:46:38 172.25.0.1 registry[3915]: time="2022-04-06T03:46:38.546533285Z" level=debug msg="authorizing request" go.version=go1.15.6 http.request.host=hub.cloud.ctripcorp.com http.request.id=5bfcac34-34fa-4a05-ae52-b3fbb3714de2 http.request.method=PATCH http.request.remoteaddr=10.109.6.219 http.request.uri="/v2/gitlab-ci/100017681/blobs/uploads/9ac3ea44-cbb6-4a1b-8048-6e59767c7370?_state=YmUOEA6F6k5OZsTu9CyQfl5CRNqlVEvx7XKgf_BVqLl7Ik5hbWUiOiJnaXRsYWItY2kvMTAwMDE3NjgxIiwiVVVJRCI6IjlhYzNlYTQ0LWNiYjYtNGExYi04MDQ4LTZlNTk3NjdjNzM3MCIsIk9mZnNldCI6MCwiU3RhcnRlZEF0IjoiMjAyMi0wNC0wNlQwMzo0NjozNi4yNTQ4MzA2MzRaIn0%3D" http.request.useragent="docker/17.09.0-ce go/go1.8.3 git-commit/afdb6d4 kernel/4.19.118-1.el7.centos.x86_64 os/linux arch/amd64 UpstreamClient(Docker-Client/17.09.0-ce \(linux\))" vars.name="gitlab-ci/100017681" vars.uuid=9ac3ea44-cbb6-4a1b-8048-6e59767c7370
Apr  6 11:46:38 172.25.0.1 registry[3915]: time="2022-04-06T03:46:38.549190549Z" level=info msg="authorized request" go.version=go1.15.6 http.request.host=hub.cloud.ctripcorp.com http.request.id=5bfcac34-34fa-4a05-ae52-b3fbb3714de2 http.request.method=PATCH http.request.remoteaddr=10.109.6.219 http.request.uri="/v2/gitlab-ci/100017681/blobs/uploads/9ac3ea44-cbb6-4a1b-8048-6e59767c7370?_state=YmUOEA6F6k5OZsTu9CyQfl5CRNqlVEvx7XKgf_BVqLl7Ik5hbWUiOiJnaXRsYWItY2kvMTAwMDE3NjgxIiwiVVVJRCI6IjlhYzNlYTQ0LWNiYjYtNGExYi04MDQ4LTZlNTk3NjdjNzM3MCIsIk9mZnNldCI6MCwiU3RhcnRlZEF0IjoiMjAyMi0wNC0wNlQwMzo0NjozNi4yNTQ4MzA2MzRaIn0%3D" http.request.useragent="docker/17.09.0-ce go/go1.8.3 git-commit/afdb6d4 kernel/4.19.118-1.el7.centos.x86_64 os/linux arch/amd64 UpstreamClient(Docker-Client/17.09.0-ce \(linux\))" vars.name="gitlab-ci/100017681" vars.uuid=9ac3ea44-cbb6-4a1b-8048-6e59767c7370
Apr  6 11:46:38 172.25.0.1 registry[3915]: time="2022-04-06T03:46:38.549281495Z" level=debug msg="(*linkedBlobStore).Resume" auth.user.name="harbor_registry_user" go.version=go1.15.6 http.request.host=hub.cloud.ctripcorp.com http.request.id=5bfcac34-34fa-4a05-ae52-b3fbb3714de2 http.request.method=PATCH http.request.remoteaddr=10.109.6.219 http.request.uri="/v2/gitlab-ci/100017681/blobs/uploads/9ac3ea44-cbb6-4a1b-8048-6e59767c7370?_state=YmUOEA6F6k5OZsTu9CyQfl5CRNqlVEvx7XKgf_BVqLl7Ik5hbWUiOiJnaXRsYWItY2kvMTAwMDE3NjgxIiwiVVVJRCI6IjlhYzNlYTQ0LWNiYjYtNGExYi04MDQ4LTZlNTk3NjdjNzM3MCIsIk9mZnNldCI6MCwiU3RhcnRlZEF0IjoiMjAyMi0wNC0wNlQwMzo0NjozNi4yNTQ4MzA2MzRaIn0%3D" http.request.useragent="docker/17.09.0-ce go/go1.8.3 git-commit/afdb6d4 kernel/4.19.118-1.el7.centos.x86_64 os/linux arch/amd64 UpstreamClient(Docker-Client/17.09.0-ce \(linux\))" vars.name="gitlab-ci/100017681" vars.uuid=9ac3ea44-cbb6-4a1b-8048-6e59767c7370
Apr  6 11:46:38 172.25.0.1 registry[3915]: time="2022-04-06T03:46:38.552098655Z" level=debug msg="s3aws.GetContent("/docker/registry/v2/repositories/gitlab-ci/100017681/_uploads/9ac3ea44-cbb6-4a1b-8048-6e59767c7370/startedat")" auth.user.name="harbor_registry_user" go.version=go1.15.6 http.request.host=hub.cloud.ctripcorp.com http.request.id=5bfcac34-34fa-4a05-ae52-b3fbb3714de2 http.request.method=PATCH http.request.remoteaddr=10.109.6.219 http.request.uri="/v2/gitlab-ci/100017681/blobs/uploads/9ac3ea44-cbb6-4a1b-8048-6e59767c7370?_state=YmUOEA6F6k5OZsTu9CyQfl5CRNqlVEvx7XKgf_BVqLl7Ik5hbWUiOiJnaXRsYWItY2kvMTAwMDE3NjgxIiwiVVVJRCI6IjlhYzNlYTQ0LWNiYjYtNGExYi04MDQ4LTZlNTk3NjdjNzM3MCIsIk9mZnNldCI6MCwiU3RhcnRlZEF0IjoiMjAyMi0wNC0wNlQwMzo0NjozNi4yNTQ4MzA2MzRaIn0%3D" http.request.useragent="docker/17.09.0-ce go/go1.8.3 git-commit/afdb6d4 kernel/4.19.118-1.el7.centos.x86_64 os/linux arch/amd64 UpstreamClient(Docker-Client/17.09.0-ce \(linux\))" trace.duration=2.760534ms trace.file="/go/src/github.com/docker/distribution/registry/storage/driver/base/base.go" trace.func="github.com/docker/distribution/registry/storage/driver/base.(*Base).GetContent" trace.id=aa22d5f1-24db-4d80-8867-bec6b3daadc2 trace.line=95 vars.name="gitlab-ci/100017681" vars.uuid=9ac3ea44-cbb6-4a1b-8048-6e59767c7370
Apr  6 11:46:40 172.25.0.1 registry[3915]: time="2022-04-06T03:46:40.800564701Z" level=debug msg="s3aws.Writer("/docker/registry/v2/repositories/gitlab-ci/100017681/_uploads/9ac3ea44-cbb6-4a1b-8048-6e59767c7370/data", true)" auth.user.name="harbor_registry_user" go.version=go1.15.6 http.request.host=hub.cloud.ctripcorp.com http.request.id=5bfcac34-34fa-4a05-ae52-b3fbb3714de2 http.request.method=PATCH http.request.remoteaddr=10.109.6.219 http.request.uri="/v2/gitlab-ci/100017681/blobs/uploads/9ac3ea44-cbb6-4a1b-8048-6e59767c7370?_state=YmUOEA6F6k5OZsTu9CyQfl5CRNqlVEvx7XKgf_BVqLl7Ik5hbWUiOiJnaXRsYWItY2kvMTAwMDE3NjgxIiwiVVVJRCI6IjlhYzNlYTQ0LWNiYjYtNGExYi04MDQ4LTZlNTk3NjdjNzM3MCIsIk9mZnNldCI6MCwiU3RhcnRlZEF0IjoiMjAyMi0wNC0wNlQwMzo0NjozNi4yNTQ4MzA2MzRaIn0%3D" http.request.useragent="docker/17.09.0-ce go/go1.8.3 git-commit/afdb6d4 kernel/4.19.118-1.el7.centos.x86_64 os/linux arch/amd64 UpstreamClient(Docker-Client/17.09.0-ce \(linux\))" trace.duration=2.248339896s trace.file="/go/src/github.com/docker/distribution/registry/storage/driver/base/base.go" trace.func="github.com/docker/distribution/registry/storage/driver/base.(*Base).Writer" trace.id=8dfdaa69-9ace-4c3e-86cc-ef9c330b5106 trace.line=142 vars.name="gitlab-ci/100017681" vars.uuid=9ac3ea44-cbb6-4a1b-8048-6e59767c7370
Apr  6 11:46:40 172.25.0.1 registry[3915]: time="2022-04-06T03:46:40.800637996Z" level=error msg="error resolving upload: s3aws: Path not found: /docker/registry/v2/repositories/gitlab-ci/100017681/_uploads/9ac3ea44-cbb6-4a1b-8048-6e59767c7370/data" auth.user.name="harbor_registry_user" go.version=go1.15.6 http.request.host=hub.cloud.ctripcorp.com http.request.id=5bfcac34-34fa-4a05-ae52-b3fbb3714de2 http.request.method=PATCH http.request.remoteaddr=10.109.6.219 http.request.uri="/v2/gitlab-ci/100017681/blobs/uploads/9ac3ea44-cbb6-4a1b-8048-6e59767c7370?_state=YmUOEA6F6k5OZsTu9CyQfl5CRNqlVEvx7XKgf_BVqLl7Ik5hbWUiOiJnaXRsYWItY2kvMTAwMDE3NjgxIiwiVVVJRCI6IjlhYzNlYTQ0LWNiYjYtNGExYi04MDQ4LTZlNTk3NjdjNzM3MCIsIk9mZnNldCI6MCwiU3RhcnRlZEF0IjoiMjAyMi0wNC0wNlQwMzo0NjozNi4yNTQ4MzA2MzRaIn0%3D" http.request.useragent="docker/17.09.0-ce go/go1.8.3 git-commit/afdb6d4 kernel/4.19.118-1.el7.centos.x86_64 os/linux arch/amd64 UpstreamClient(Docker-Client/17.09.0-ce \(linux\))" vars.name="gitlab-ci/100017681" vars.uuid=9ac3ea44-cbb6-4a1b-8048-6e59767c7370
Apr  6 11:46:40 172.25.0.1 registry[3915]: time="2022-04-06T03:46:40.800755496Z" level=error msg="response completed with error" auth.user.name="harbor_registry_user" err.code=unknown err.detail="s3aws: Path not found: /docker/registry/v2/repositories/gitlab-ci/100017681/_uploads/9ac3ea44-cbb6-4a1b-8048-6e59767c7370/data" err.message="unknown error" go.version=go1.15.6 http.request.host=hub.cloud.ctripcorp.com http.request.id=5bfcac34-34fa-4a05-ae52-b3fbb3714de2 http.request.method=PATCH http.request.remoteaddr=10.109.6.219 http.request.uri="/v2/gitlab-ci/100017681/blobs/uploads/9ac3ea44-cbb6-4a1b-8048-6e59767c7370?_state=YmUOEA6F6k5OZsTu9CyQfl5CRNqlVEvx7XKgf_BVqLl7Ik5hbWUiOiJnaXRsYWItY2kvMTAwMDE3NjgxIiwiVVVJRCI6IjlhYzNlYTQ0LWNiYjYtNGExYi04MDQ4LTZlNTk3NjdjNzM3MCIsIk9mZnNldCI6MCwiU3RhcnRlZEF0IjoiMjAyMi0wNC0wNlQwMzo0NjozNi4yNTQ4MzA2MzRaIn0%3D" http.request.useragent="docker/17.09.0-ce go/go1.8.3 git-commit/afdb6d4 kernel/4.19.118-1.el7.centos.x86_64 os/linux arch/amd64 UpstreamClient(Docker-Client/17.09.0-ce \(linux\))" http.response.contenttype="application/json; charset=utf-8" http.response.duration=2.255332326s http.response.status=500 http.response.written=203 vars.name="gitlab-ci/100017681" vars.uuid=9ac3ea44-cbb6-4a1b-8048-6e59767c7370
```

对应的 Registry Access log 如下：

第一步请求：

![request-1]({{ site.baseurl }}/images/docker-push-500-image-1.png)

第二步请求：

![request-2]({{ site.baseurl }}/images/docker-push-500-image-2.png)


第一步中 对应的 S3 的 Access 日志如下：

![request-3]({{ site.baseurl }}/images/docker-push-500-image-3.png)

可以看到两点：

1. 请求 2.2 秒才返回，但 Registry 这边 58 毫秒就返回了。所以怀疑是异步。
2. S3 请求处理完的时候，Client 这边的第二步已经执行了，导致 PathNotFoundError。
