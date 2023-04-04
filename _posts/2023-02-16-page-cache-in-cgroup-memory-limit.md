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

## 清理策略

多提一句，cgroup v2 的清理 page cache 策略应该比 v1 有优化，参考如下：

> Another important topic in cgroup v2, which was unachievable with the previous v1, is a proper way of tracking Page Cache IO writebacks. The v1 can’t understand which memory cgroup generates disk IOPS and therefore, it incorrectly tracks and limits disk operations. Fortunately, the new v2 version fixes these issues. It already provides a bunch of new features which can help with Page Cache writeback.

[https://biriukov.dev/docs/page-cache/6-cgroup-v2-and-page-cache/](https://biriukov.dev/docs/page-cache/6-cgroup-v2-and-page-cache/)

## 验证

### 准备工作

创建几个文件待用

```
# dd if=/dev/random of=1 bs=1000000 count=500
500+0 records in
500+0 records out
500000000 bytes (500 MB) copied, 3.03696 s, 165 MB/s
[root@test-page-cache]# for i in {1..6} ; do dd if=/dev/random of=$i bs=1000000 count=500 ; done
500+0 records in
500+0 records out
500000000 bytes (500 MB) copied, 3.13473 s, 160 MB/s
500+0 records in
500+0 records out
500000000 bytes (500 MB) copied, 3.06832 s, 163 MB/s
500+0 records in
500+0 records out
500000000 bytes (500 MB) copied, 3.04262 s, 164 MB/s
500+0 records in
500+0 records out
500000000 bytes (500 MB) copied, 3.03191 s, 165 MB/s
500+0 records in
500+0 records out
500000000 bytes (500 MB) copied, 3.04711 s, 164 MB/s
500+0 records in
500+0 records out
500000000 bytes (500 MB) copied, 3.07169 s, 163 MB/s
```

清理一下page cache

```
[root@test-page-cache]# free -h
              total        used        free      shared  buff/cache   available
Mem:            22G        5.8G        2.8G        365M         14G         16G
Swap:          8.0G         16M        8.0G
[root@test-page-cache]# echo 3 > /proc/sys/vm/drop_caches
[root@test-page-cache]# free -h
              total        used        free      shared  buff/cache   available
Mem:            22G        5.3G         16G        365M        1.2G         16G
Swap:          8.0G         16M        8.0G
```

启动一个带 memory limit 的 docker 容器

```
docker run --rm -ti -v $PWD:/tmp/test-page-cache -w /tmp/test-page-cache --memory 1G alpine:3.16.2
```

### 测试1

测试1，是想验证一下 page cache 算在 limit 里面吗，以及触发了 limit 会怎么样？

读取两个之前生成的文件（每个文件500MB）

```
/tmp/test-page-cache # cat 1 > /dev/null
/tmp/test-page-cache # cat 2 > /dev/null
```

看一下 page cache 情况

```
[root@89e16b39fdc6da0f6c0e4d936aa0df8141ebe20d033fd8a7540ad0d550d8163c]# free -h
              total        used        free      shared  buff/cache   available
Mem:            22G        5.3G         15G        365M        2.6G         16G
Swap:          8.0G         16M        8.0G

# pwd
/sys/fs/cgroup/memory/docker/89e16b39fdc6da0f6c0e4d936aa0df8141ebe20d033fd8a7540ad0d550d8163c
# cat memory.usage_in_bytes
1073512448
# cat memory.stat
cache 1069584384
rss 106496
rss_huge 0
shmem 0
mapped_file 0
dirty 0
writeback 0
swap 0
pgpgin 488796
pgpgout 227651
pgfault 924
pgmajfault 0
inactive_anon 102400
active_anon 0
inactive_file 1069461504
active_file 0
unevictable 0
hierarchical_memory_limit 1073741824
hierarchical_memsw_limit 2147483648
total_cache 1069584384
total_rss 106496
total_rss_huge 0
total_shmem 0
total_mapped_file 0
total_dirty 0
total_writeback 0
total_swap 0
total_pgpgin 488796
total_pgpgout 227651
total_pgfault 924
total_pgmajfault 0
total_inactive_anon 102400
total_active_anon 0
total_inactive_file 1069461504
total_active_file 0
total_unevictable 0
```

在容器里面继续读文件

```
/tmp/test-page-cache # for i in 1 2 3 4 5 6 ; do echo $i ; cat $i > /dev/null ; done
1
2
3
4
5
6
/tmp/test-page-cache #
```

可以看到 page cache 不再增加了

```
# free -h
              total        used        free      shared  buff/cache   available
Mem:            22G        5.3G         14G        365M        2.7G         16G
Swap:          8.0G         16M        8.0G
# cat memory.stat
cache 1067421696
rss 241664
rss_huge 0
shmem 0
mapped_file 0
dirty 0
writeback 0
swap 0
pgpgin 1099560
pgpgout 838969
pgfault 1617
pgmajfault 0
inactive_anon 372736
active_anon 0
inactive_file 1067384832
active_file 0
unevictable 0
hierarchical_memory_limit 1073741824
hierarchical_memsw_limit 2147483648
total_cache 1067421696
total_rss 241664
total_rss_huge 0
total_shmem 0
total_mapped_file 0
total_dirty 0
total_writeback 0
total_swap 0
total_pgpgin 1099560
total_pgpgout 838969
total_pgfault 1617
total_pgmajfault 0
total_inactive_anon 372736
total_active_anon 0
total_inactive_file 1067384832
total_active_file 0
total_unevictable 0
# cat memory.usage_in_bytes
1073528832
```

使用 vmtouch 这样的工具，应该可以看到前一个文件的 cache 被清掉了。不方便安装，就不再继续验证了。

### 测试2

测试2是验证一下，page cache 算在第一个进程里面。其实就是说，如果文件已经在 page cache 里面了，再次 read 不会增加本进程所在cgroup 的 cache 值。

先在宿主机上面清理一下 page cache，准备一个干净的环境。然后在宿主机在 cat 一个文件，缓存到 page cache 里面。

```
# echo 3 > /proc/sys/vm/drop_caches
# free -h
              total        used        free      shared  buff/cache   available
Mem:            22G        5.3G         16G        365M        1.2G         16G
Swap:          8.0G         16M        8.0G
[root@VMS172906 ~]# cd /tmp/test-page-cache/
# cat 1 > /dev/null
```

然后在容器里面，再次 `cat 1`，可以看到容器的内存使用没有增加。

```
# cat memory.stat
cache 675840
rss 241664
rss_huge 0
shmem 0
mapped_file 0
dirty 0
writeback 0
swap 0
pgpgin 1100286
pgpgout 1100138
pgfault 2673
pgmajfault 0
inactive_anon 507904
active_anon 0
inactive_file 520192
active_file 0
unevictable 0
hierarchical_memory_limit 1073741824
hierarchical_memsw_limit 2147483648
total_cache 675840
total_rss 241664
total_rss_huge 0
total_shmem 0
total_mapped_file 0
total_dirty 0
total_writeback 0
total_swap 0
total_pgpgin 1100286
total_pgpgout 1100138
total_pgfault 2673
total_pgmajfault 0
total_inactive_anon 507904
total_active_anon 0
total_inactive_file 520192
total_active_file 0
total_unevictable 0
```
