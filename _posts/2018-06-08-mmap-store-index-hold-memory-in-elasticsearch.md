---

date: 2018-06-08 10:08:17 +0800
title: ES中使用mmap存储的索引会锁定内存不释放?
layout: post

---

在可用内存不充足的情况下, ES中索引配置如果使用mmapfs, 会导致内存不足, Load飙升.

虽然从发现这个问题到最后确认原因,花了很长时间, 这里长话短说.

<!--more-->

## 起因/背景

我们ES集群有些节点是存储冷数据,希望能尽量Hold住更多数据,所以一个服务器上面起了三个ES实例.

机器是128G内存,每个节点是30G Heap.

ES版本升级到5之后,发现这些节点的Load很升到非常高,以至于没办法工作. 老板在github上面提交了一个issue [https://github.com/elastic/elasticsearch/issues/21611](https://github.com/elastic/elasticsearch/issues/21611). 最后通过 `index.store.type=niofs` 设置暂时规避了这个问题.

对比说明一下, 我们还有一些写热数据的节点, 128G内存, 只起了一个节点, Heap 30G, 索引不多, 只有最近2天的. 这些节点并没有出现上述现象.

## 问题定位 -- 错误的方法

使用vmtouch对比测试了mmapfs和niofs的区别, 发现mmapfs的时候, `vmtouch -e` 是清不掉cache的. 而niofs可以.

如果我能多一些sense的话, 也许就能马上反应过来, java里面的mmap系统调用的问题. 然后我并没有... 从些走上了漫长的不知道在做些啥的错误的路上.

这里多说一句, `vmouthc -e` 清掉的cache应该是readahead引起的, 如果把readahead设置为0, 就会发现被清掉的cahce非常小. (所以ES应该把readahead设置小一些?)

## 问题定位 -- 应该是定位了

使用strace查看系统调用, 发现mmap的参数是MAP_SHARED, 如下:

```
18029 open("/var/data/elasticsearch/nodes/0/indices/vHn-_-MWS7S7UzEmdiDHwQ/1/index/_18.si", O_RDONLY <unfinished ...>
18022 <... close resumed> )             = 0
18029 <... open resumed> )              = 240
18029 mmap(NULL, 379, PROT_READ, MAP_SHARED, 240, 0) = 0x7fba800ef000
```

具体的实现参见[https://github.com/openjdk-mirror/jdk7u-jdk/blob/f4d8095/src/solaris/native/sun/nio/ch/FileChannelImpl.c#L83](https://github.com/openjdk-mirror/jdk7u-jdk/blob/f4d8095/src/solaris/native/sun/nio/ch/FileChannelImpl.c#L83)

## 结论 (也许是结论吧?)

cache清不掉, 导致最终swap, load飙升. 嗯, 就这样吧.
