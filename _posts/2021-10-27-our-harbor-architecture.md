---

layout: post
title: 我们的 Habror 灾备架构
date: 2021-10-27T11:09:00+0800

---

介绍一下背景，我们使用 harbor 做镜像仓库服务，后端存储使用 Ceph。

现在 1 需要做两机房的灾备， 2 Ceph 还没有两机房的集群能力。

<!--more-->

## 之前方案

最开始是两个机房各搭建一套 Harbor，使用 Harbor 自带的镜像复制功能。 

各使用独立的 DB 和 Ceph。

有一个问题是，因为 DB 是独立的，在一个 Harbor 里面配置的 Webhook，以及用户的权限，等等不能同步。 如果一个机房挂了切换到另外一个 Harbor 的时候，里面的用户和项目的数据会有不一致。

## 当前方案

Ceph 存储还是各用各的，但使用一个 DB。因为考虑到我们的使用场景，并没有引用额外的问题。而且解决了用户和项目级别数据不一致的问题。

Harbor 做镜像复制期间，用户在 Web 可以看到这个镜像，但如果从 DR Harbor 去拉数据，可能会不存在。

但这个问题不大，因为我们**不是**双活，只有一边提供服务。正好在复制期间因为 IDC 故障而切换 DR，的确会有问题。但 IDC 都故障了，就算是使用之前的方案也一样会有问题。

## 架构图

![架构图](https://childe.github.io/ohmycat/images/harbor-dr.png)

## 一个问题

在 [https://childe.github.io/ohmycat//2021/10/26/one-small-harbor-issue.html](https://childe.github.io/ohmycat//2021/10/26/one-small-harbor-issue.html) 里面也有记录。

manifest 文件是一个 json 文件，可能因为字典结构 Key 的无序（猜测，还未去证实），导致文件内容虽然一样，但 Sha256 不一样。

Harbor 在做镜像复制的时候，两边的 Ceph 对同一个 Tag 的 Manifest 文件都存了，但 DB 里面的 Sha256 被新的不同值覆盖了。

使用Sha256 去拉镜像，可能会404。

使用 Tag 去拉数据没问题，因为 Ceph 按 Tag 去找数据都是有的。

我们的场景几乎全部都是使用 Tag 拉数据。问题在于，Harbor 有个逻辑: 先把 Tag 转成 Sha256 再去 Registry 拉数据。就会触发上面的问题了。所以我们把 Harbor 这段代码注释掉了。运行两周，目前无问题。<s>还不太清楚 Harbor 加上这段逻辑的目的</s>。因为 Harbor 使用自己的 Tag 管理机制，也就是先把 Tag 转成 Sha256 再 proxy 到后面的 registry。Harbor 这样做，可能是因为 Harbor 有一个自己的功能：在 Web 上给一个 Image 添加一个 Tag。这个功能的实现只是在 Harbor 数据库里面添加一个记录，并没有在存储这一层添加 Tag 索引。我自己觉得这不是一个好办法，因为他和官方的 Registry 不兼容，也很可能和别的第三方 Registry 不兼容。
