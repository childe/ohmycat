---

date: 2021-10-08T11:35:00+0800

---

对照[https://docs.docker.com/registry/spec/api/#pushing-an-image](https://docs.docker.com/registry/spec/api/#pushing-an-image)，使用 Flask 做一下实现。但发现有两处和文件不太符合的地方。

1. Chunked Upload

文档中说，需要返回格式如下：

```
202 Accepted
Location: /v2/<name>/blobs/uploads/<uuid>
Range: bytes=0-<offset>
Content-Length: 0
Docker-Upload-UUID: <uuid>
```

这里显示 Range 的格式与[Range - HTTP | MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Range) 中说的一致。

但实际上，前面不能加 `bytes=`。

上面的文档是说 Request 里面的 Range，但 Docker 文档这里用到的其实是 Response，不知道是不是这个区别，感觉前面加单位是合理的。

2. Completed Upload

传输完成一个 Layer之后，需要 Put 确认完成。 Server 应该返回如下信息。
```
201 Created
Location: /v2/<name>/blobs/<digest>
Content-Length: 0
Docker-Content-Digest: <digest>
```

文档中说 `The Location header will contain the registry URL to access the accepted layer file`。 

但实际上，docker cli 不会通过这个返回的 Location 来确认 Layer。而是通过 `HEAD /v2/liujia/test/blobs/sha256:c74f8866df097496217c9f15efe8f8d3db05d19d678a02d01cc7eaed520bb136 HTTP/1.1` 来确认的。就是说，不管Location 返回什么，都是通过之前的 digest 来做 HEAD 请求确认 Layer 信息的。

3. Get Manifest

返回的时候，需要解析 manifest 文件里面的 mediaType 作为 content-type 返回。
