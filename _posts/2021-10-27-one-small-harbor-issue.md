---

layout: post
title: 记一个 Harbor 中的小问题 -- get-manifest header-content-type 变化
date: 2021-10-27 00:08:07 +0800

---

## 起因

一个同事 使用 Ruby 调用 harbor `GET /v2/<name>/manifests/<reference>` 接口，开始的时候没有问题。

后来，因为我们 harbor 架构的问题，对 harbor 代码做了一个小的改造。导致同事那边 Ruby 拿到的结果不认为是 Json，而是一个 String，需要再次 Json 解析一次。

同事看起来，认为是 header 里面的 content-type 变了导致的。需要我们查明一下原因。

## Harbor 代码

先看 Harbor 中我们改代码的那块。

```
// the reference is tag, replace it with digest
if _, err = digest.Parse(reference); err != nil {
    req = req.Clone(req.Context())
    req.URL.Path = strings.TrimSuffix(req.URL.Path, reference) + art.Digest
    req.URL.RawPath = req.URL.EscapedPath()
}

recorder := lib.NewResponseRecorder(w)
proxy.ServeHTTP(recorder, req)
```

直接就代理然后反回了，所以还要看 Registry 的代码。

## Registry 代码

Get Manifest 入口在 `app.register(v2.RouteNameManifest, manifestDispatcher)`

很快可以看到下面这段代码。

```
// Only rewrite schema2 manifests when they are being fetched by tag.
// If they are being fetched by digest, we can't return something not
// matching the digest.
if imh.Tag != "" && manifestType == manifestSchema2 && !supports[manifestSchema2] {
    // Rewrite manifest in schema1 format
    dcontext.GetLogger(imh).Infof("rewriting manifest %s in schema1 format to support old client", imh.Digest.String())

    manifest, err = imh.convertSchema2Manifest(schema2Manifest)
    if err != nil {
        return
    }
} else if imh.Tag != "" && manifestType == manifestlistSchema && !supports[manifestlistSchema] {
    ...
}

...
...

ct, p, err := manifest.Payload()
```

最后的 content-type 也是根据 Manifest 类型不同而不同的。

