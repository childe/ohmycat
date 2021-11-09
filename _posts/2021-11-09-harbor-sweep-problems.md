---

date: 2021-11-09T10:30:11+0800
title: Harbor v2.2.0 中 Sweep 引发的两个问题

---

在说这些问题之前，先说一下 Harbor 里面触发镜像复制任务（其他任务类似）的大概流程。

1. Put Manifest 接口已经是 Docker Push 的最后一步了，里面会生成 Event，并做 Publish。至于需要 Publish 到哪里去，是https://github.com/goharbor/harbor/blob/release-2.4.0/src/pkg/notifier/notifier.go 里面注册的。

2. controller/replication/controller:Start 里面创建一个 Execution **（注意，这里会创建 Sweep Goroutine）**

3. 开一个 Goroutine ，创建 Tasks (一个 Execution 可能对应多个 Tasks)

4. Task 里面提交 Job，`POST /api/v1/jobs`

5. Core 组件里面收到这个请求，调用 LauchJob，会任务 Enqueue 到 Redis 里面注册的。

以上都是 Core 里面做的。

接下来 Jobservice 组件收到这个 Job，开始处理。并在任务成功或者失败时，回调一下配置在 Job 里面的 StatusHook。

<!--more-->

## 第一个问题

每 Push 一个镜像，就会生成一个 Execution，**并同时创建一个Sweep Goroutine**。

这个 Sweep 里面，会在一个死循环里面不停歇的查询当前的 Execution，如果 Execution 是完成或者失败了，就从 DB 里面清掉，避免 DB 数据爆炸。

如果有任务堆积，比如说后端存储卡了一点，就会堆积上百及至上千的任务。就会有上千个 Goroutine 去不停歇的查 DB，把 DB 的 CPU 打爆。这又导致任务执行变慢，陷入恶性循环。

更严重的是，如果有脏数据，比如因为某些原因，一个任务处于 Pending 状态不再执行了，那就会导致 Goroutine 再也不退出了，还会越来越多。

## 第二个问题

前面提到，Task 完成或者失败的时候会调用配置在 Job 里面的 StatusHook。这个会调用到 Core 里面去，Core 里面会更新 Task 在 DB 里面的状态数据。

如果这个回调失败的话，JobService 会重试，一直重试，直到成功为止或者24小时之后任务超时。

来演绎一下。

1. 一个Execution，下面有一个任务，第一次执行失败了。回调 Core。 Core 把数据库里面的 Task 设置为失败。

2. Sweep 将失败的 Execution 以及下面的 Tasks 从 DB 里面清除掉。

3. Jobservice 重试任务，成功了，再次回调 Core。 返回 404 错误，因为 DB 里面已经没有这个 Taks 了。

4. 不停的回调，直到 24 超时。
