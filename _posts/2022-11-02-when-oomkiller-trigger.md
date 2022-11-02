---

date: 2022-11-02T23:25:53+0800
title: [译]Linux下 OOMKiller 什么时候被触发
layout: post

---

原文[Roughly when the Linux Out-Of-Memory killer triggers (as of mid-2019)](https://utcc.utoronto.ca/~cks/space/blog/linux/OOMKillerWhen)

原文发表时间，2019-08-11

因为某些别的原因，我最近想了解 Linux 里面 OOM Killer 是何时触发（以及不触发）的，以及为什么。这方面的详细文档不多，以及有些已经过时了。我在这里也没办法添加详细文档，因为这需要对 Linux 内核代码很了解，但我至少可以大概写些观点供我自己使用。


现如今有两种不同类型的 OOM Killer：全局的 OOM Killer 和 依赖 cgroup 的 OOM Killer（后者通过cgroup 内存控制器实现）。我主要是对全局的感兴趣，部分是因为 cgroup OOM Killer 相对来说容易预测。


简单来说，当内核在分配物理内存页有有困难时，全局 OOM Killer 触发。 当内核尝试分配内存页（不管用于任何用途，用于内核使用或需要内存页的进程）并且失败时，它将尝试各种方法来回收和压缩内存。如果成功了或至少取得了一些进展，内核会继续重试分配（我从代码中了解到）； 如果他们未能释放内存页或取得进展，它会在许多（但不是全部）情况下触发 OOM Killer。


(比如说，内核申请连续大段内存页失败，是不会触发的，参考[Decoding the Linux kernel's page allocation failure messages](https://utcc.utoronto.ca/~cks/space/blog/linux/DecodingPageAllocFailures)。如果申请的连续内存小于 等于 30KB 才会触发。`git blame` 显示从2007年就开始是这样的了。)


据我所知，OOM Killer 会因为申请同一块内存失败而多次触发。比如说，申请这块内存失败导致 OOM Killer 释放了一些内存。接下来的申请同一块内存又失败了（可能释放的内存已经被别的进程用掉了），会再次触发 OOM Killer。而且据我所知，OOM Killer 也允许连续的多次触发。并没有什么两次 OOM Killer 之间需要间隔多少时间的限制。只要内存不够用了，就会触发，就这么简单。

(当然了，你希望一次 OOM Killer 可以释放一大堆内存，这也是 OOM Killer 存在的意义)


全局 OOM Killer 在进程申请虚拟内存的时候不会触发，因为这不会真正分配物理内存。是不是允许内存分配（译者注：这里说的是物理内存还虚拟内存？）和物理内存状态未必是不相关的（这里我没有理解明白），但我相当肯定的是，哪怕没有严格达到过度使用的限制（这是指什么？），OOM Killer 也可能被触发。另一方面，内存申请可能失败，但没有触发 OOM Killer。


在当前的 Linux 代码中，你可以在 [mm/page_alloc.c](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/mm/page_alloc.c) 中的 `__alloc_pages_slowpath` 函数中看到。[mm/oom_kill.c](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/mm/oom_kill.c) 和真正杀死进程相关。

PS: 我不想推测什么时候应该触发 OOM Killer 却没有触发。但根据内存回收这块的实现来看，好像有一些比较明显的可能性。

边栏：我觉得 cgroup OOM 何时触发

如果你在使用 memory cgroup 控制器（v1 或者 v2）而且你设置了一下内存限制，当 cgroup 中的内存快达到这个限制的时候，内核会尝试将内存驱逐（比如说 swap）。如果驱的速度不够快，到达到内存的限制，就会触发 OOM Killer。

这一块代码在 [mm/memcontrol.c](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/mm/memcontrol.c)。你可以看一下 out_of_memory 是怎么调用的。我相信是 cgroup 中用到的所有内存触发这个限制，而不仅仅是进程占用的内存。（还有啥会占用？）

在一般配置下，我相信，一个做了内存限制的 cgroup 会导致 OOM Killer 之前 把 swap 用完。

如果你想知道是全局 OOMKiller 还是 cgroup OOMKiller，可以看系统日志。


cgroup 的长这样：

> Memory cgroup out of memory: Kill process ... score <num> or sacrifice child

全局的长这样：

> Out of memory: Kill process ... score <num> or sacrifice child
