---

date: 2023-02-16T00:28:35+0800
title: cgroup memory limit 是不是计算 page cache
layout: post

---

## 测试环境

OS: CentOS Linux release 7.6.1810 (Core) ; KERNEL 5.10.56 ; Cgroup: v1

## 问题

一个问题，Cgroup 下面的进程读写文件，就会生成 page cache。这部分内存使用计算到 Cgroup Memory Limit 里面吗？

我感觉是不会的（**其实会**），因为如果会的话，会引出下面这个问题：

问题二：系统怎么知道这个 page cache 属于哪个进程？

A 读了一个文件之后，B 又读了，那这个 page cache 是同时算到 A 和 B 进程里面？

A 读了之后，B 又使用到，那就算到 B 头上了？从 A 里面去掉？


## 结果

直接说测试下来的结果吧。

page cache 会计算到 cgroup limit 里面。

但内存超的时候，不会直接触发 OOM Killer，而是会清理部分 page cache。

page cache 始终算在第一个使用它的进程（以及对应的 Cgroup）上。
