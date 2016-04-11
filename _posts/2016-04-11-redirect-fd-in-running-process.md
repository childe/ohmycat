---
layout: post
title:  "重定向一个进程的输出"
date:   2016-04-11 16:50:05 +0800
abstract:   "
<p>一个已经运行着的进行, 如果重定向输出?</p>
<p>比如默认是输出到终端, 现在想重定义到一个文件中</p>
<p>或者是文件被删除了, 想重新指过去(简单的在同样路径新建文件是没用的)</p>
"
keywords: linux redirect
categories: linux
---

## 把ping的输出重定义向文件中

先跑一个ping进程 

```sh
ping www.baidu.com 
PING www.a.shifen.com (61.135.169.121) 56(84) bytes of data.
64 bytes from 61.135.169.121: icmp_seq=1 ttl=61 time=26.9 ms
64 bytes from 61.135.169.121: icmp_seq=2 ttl=61 time=26.3 ms
64 bytes from 61.135.169.121: icmp_seq=3 ttl=61 time=24.3 ms
64 bytes from 61.135.169.121: icmp_seq=4 ttl=61 time=23.6 ms
64 bytes from 61.135.169.121: icmp_seq=5 ttl=61 time=24.7 ms
64 bytes from 61.135.169.121: icmp_seq=6 ttl=61 time=23.5 ms
```

到/proc/XX/fd 下面看一下当前所有的文件描述符

```sh
# ls -l
total 0
lrwx------ 1 root root 64 Apr 11 09:31 0 -> /dev/pts/0
lrwx------ 1 root root 64 Apr 11 09:31 1 -> /dev/pts/0
lrwx------ 1 root root 64 Apr 11 09:31 2 -> /dev/pts/0
lrwx------ 1 root root 64 Apr 11 09:31 3 -> socket:[179350]
```

用gdb链接到这个进程中, gdb -p XX, 创建一个新的文件, 并把文件描述符指过去.

```
(gdb) p creat("/tmp/ping.out", 0644)
$1 = 4
(gdb) p dup2(4,1)
$2 = 1
(gdb) p close(4)
$3 = 0
(gdb) q
```

退出gdb之后, 可以看到ping不再输出到屏幕, 而是到/tmp/ping.out中了.


## 把ping的输出重定义向到另外一个文件

先跑一个ping进程, 标准输出指向一个文件

```sh
ping www.baidu.com  > /tmp/ping.out
```

用gdb链接到这个进程中, gdb -p XX, 创建一个新的文件, 并把文件描述符指过去.

```
(gdb) p creat("/tmp/ping.out.2", 0644)
$1 = 4
(gdb) p dup2(4,1)
$2 = 1
(gdb) p close(4)
$3 = 0
(gdb) q
```

## 恢复已经删除的文件

先跑一个ping进程, 重定向到/tmp/ping.out 

```sh
ping www.baidu.com > /tmp/ping.out
```

到/proc/XX/fd 下面看一下当前所有的文件描述符

```sh
root@7d82fa25da6c:/proc/28/fd# ll
total 0
dr-x------ 2 root root  0 Apr 11 09:47 ./
dr-xr-xr-x 9 root root  0 Apr 11 09:47 ../
lrwx------ 1 root root 64 Apr 11 09:48 0 -> /dev/pts/0
l-wx------ 1 root root 64 Apr 11 09:48 1 -> /tmp/ping.out
lrwx------ 1 root root 64 Apr 11 09:47 2 -> /dev/pts/0
lrwx------ 1 root root 64 Apr 11 09:48 3 -> socket:[180914]
```

如果不小心删除了 /tmp/ping.out, 
其实ping程序还在不停的写磁盘, 只不过看不到了. (tail -f /proc/28/fd/1 还是可以看到当前的输出)
而且磁盘会被不停的使用, 但很难发现是哪些文件在增长. (du是看不到的.)


如果要清除被这个隐形的文件占用的空间, 只要 `echo > /proc/28/fd/1` 就可以了.

但是这个也不怎么治本, 我们需要恢复 /tmp/ping.out这个文件.

简单的 `touch /tmp/ping.out` 是没有用的, 还是需要gdb attach过去.

```
(gdb) p creat("/tmp/ping.out", 0644)
$1 = 4
(gdb) p dup2(4,1)
$2 = 1
(gdb) p close(4)
$3 = 0
(gdb) q
```

搞定.
