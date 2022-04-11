---

layout: post
date: 2021-10-12T20:24:48+0800

---

切换 DR 之后，有些镜像 Pull 失败。想对比一下两边的全量的 Tag，看一下有哪些缺失。结果发现全量 Tag 列表是一样的。

然后就找了一下 Pull 404 的镜像。走 Registry:5000/v2/tag/list 的确返回列表里面有这个 Tag。那为啥docker pull 会报404呢？第一反应是哪里有缓存吧，翻看了一下代码，还真没有缓存。

直接 curl  /v2/{repo}manifest/{tag} ，如果走 Harbor，是404；走 Registry 就是200。看来问题出在 Harbor 这里。

抓包看了一下，Harbor 居然把 Tag 转成 sha256 再去请求，到了 Registry 的请求是 /v2/{repo}manifest/{sha256}，不太明白为啥要这样搞。

这块代码是2年前的，可能和当时的 Registry 有关系。不过现在的确带来了副作用。
