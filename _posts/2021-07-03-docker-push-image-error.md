---

date: 2021-07-03T15:03:14+0800
title: docker registry 更换后端存储后 Pull/Push 失败

---

使用 harbor v1.10 做 docker hub。

在一次测试过程，换了后端的 Swift 存储配置。 然后 Push 一个之前存在的 Image 时，显示 layers 都存在了，直接跳过，最后显示 Push 成功。但这显然是不可能的，因为后面的存储都是新的，不可能 layers 已经存在。 而且 Pull 的时候果然失败了。

<!--more-->

如果你不知道 docker push 后面发生的详细步骤，那可能诊断时会有一些不知道从何下手。比如下面几个问题，你看自己是不是知道了。

1. docker push 上传数据的时候，是走的 HTTP 协议，还是 Docker 自己的协议？

2. 是先上传 Manifest，还是先上传 layer ？

3. 上传一个 layer 的时候，是一次性上传所有数据，还是分批上传？

4. Docker 客户端怎么知道一个 layer 是不是已经存在的？


[Docker Registry HTTP API V2#pushing-an-image](https://docs.docker.com/registry/spec/api/#pushing-an-image) 这个是官方文档，非常简单，一定要看一下。


如果你已经读到这篇文档，知道了 docker push 背后的事情了，那么可以静下来，理一下思路，想想为啥 Push 到新的存储还显示 layer 已经存在了。

只可能有两个原因，第一是 harbor 这层壳作的判断，因为 DB 里面已经有数据了。第二是 Registry 自己缓存的原因。

Tcpdump Registry 的端口(默认是5000)，就可以看到其实是 Registry 的返回告诉客户端 layer 已经存在了。

接下来比较简单，翻一下 Registry 的代码很快可以定位到如果配置了 Redis 缓存，处理 Head blobs 请求的时候，会优先从缓存里面取数据。把 Redis 里面的数据清理掉就好了。
