---

date: 2020-08-12T11:05:36+0800
title: 多线程一起读stdin

---

一个进程里面开两个线程读取 stdin , 会是哪一个能读到呢? 来测下看.

<!--more-->

```
package main

import (
	"bufio"
	"fmt"
	"os"
)

func s(i int) {
	for {
		scanner := bufio.NewScanner(os.Stdin)
		scanner.Scan()
		t := scanner.Text()
		fmt.Printf("%v %v\n", i, t)
	}
}

func main() {
	c := make(chan struct{})
	for i := 0; i < 2; i++ {
		go s(i)
	}
	<-c
}
```

在 MAC 上的输出:

```
% while true ; do date ; sleep 1 ; done | go run a.go                                              1 ↵
1 Wed Aug 12 11:04:51 CST 2020
0 Wed Aug 12 11:04:52 CST 2020
1 Wed Aug 12 11:04:53 CST 2020
0 Wed Aug 12 11:04:54 CST 2020
1 Wed Aug 12 11:04:55 CST 2020
0 Wed Aug 12 11:04:56 CST 2020
```

在 MAC 上跑 Docker, alpha:3.9.4 输出

```
/tmp # while true ; do date ; sleep 1; done | ./a
1: Thu Aug 13 03:04:17 UTC 2020
0: Thu Aug 13 03:04:18 UTC 2020
0: Thu Aug 13 03:04:19 UTC 2020
1: Thu Aug 13 03:04:20 UTC 2020
1: Thu Aug 13 03:04:21 UTC 2020
1: Thu Aug 13 03:04:22 UTC 2020
0: Thu Aug 13 03:04:23 UTC 2020
1: Thu Aug 13 03:04:24 UTC 2020
0: Thu Aug 13 03:04:25 UTC 2020
1: Thu Aug 13 03:04:26 UTC 2020
0: Thu Aug 13 03:04:27 UTC 2020
0: Thu Aug 13 03:04:28 UTC 2020
1: Thu Aug 13 03:04:29 UTC 2020
^C
```

`ll /proc/self/fd` 可以看到 stdin/stdout/stderr 都是指向 `/dev/pts/xx`

`/dev/pts/xx` 是什么呢？ 其实是 linux 的 pty 提供的功能。

> pty -- pseudo terminal driver

man page 里面写到，pt 是一对 character devices，一个称之为 master device，一个叫 slave device。slave device 给程序提供了一个接口。真正的 terminal 后面是由一些驱动处理输入的，但 slave device 后面是 master device 来处理。也就是说写到master 的数据成了 slave 的输入，写到slave 的数据也同样成了 master 的输入。

[pts man page](https://man7.org/linux/man-pages/man4/pts.4.html) 里面说了一下他的使用方法。

又看了一下 script.c 的代码，应该是这样的，open('/dev/ptmx')，拿到一个fd，这个是master。同时系统会生成一个 slave，在/dev/pts/xx 这里。他们是一对 pipe。

对 pty 做了三个测试, 有些不明白.

## 测试1

SSH 登陆到一台机器，tty 看到他的是 pty 是 /dev/pts/0。我就在当前屏幕敲字母, 会一个个打印出来(废话). 我的理解是, 我在键盘敲字母, 这是输入, 输入到 /dev/pts/0。也就是做为master的输入。lsof 看了一下，master（也就是 /dev/ptmx）在 sshd。那就是说 sshd 又 echo 回来，所以输出到 /dev/pts/0 ? 表现就是在当前屏幕打印出来. 这也是我们平时司空见惯的表现.

但 sshd 和 bash 之间也隔着一些东西吧？不太明白。另外，如果是 docker 容器， lsof 看，并没有进程使用 ptmx，也就是没有 master? 那 slave 的数据去哪里处理了呢？

## 测试2

另外开一个 SSH 登陆到同一台机器, 运行 `cat /dev/pts/0` . 然后在前一个SSH 里面敲字母, 这时候可以看到敲的字母会一个出现在当前屏幕, 下一个出现在新的 SSH 屏幕, 交替出现. 我的理解是, 我在键盘敲字母, 这是输入, 输入到 /dev/pts/0 . 最后又输出到 /dev/pts/0, 但 /dev/pts/0 被两个进程读取(一个是前一个 SSH 的 Bash, 另外一个是 CAT), 所以交替出现在两边.

但是，哪一次在 bash，哪一次在 cat 呢？不明白。

## 测试3

再开一个 SSH 登陆到同一台机器, 运行 `date > /dev/pts/0` , 可以看到日期输出到了第一个 SSH 里面. 此时第二个 SSH 里面的 CAT 还在运行着, 但并没有捕获任何输出.  我的理解: 没能理解.

尝试理一下，date 输入到 /dev/pts/0，它是 slave，然后 sshd 处理之后，写到 ptmx(master)，也就是输入到 /dev/pts/0(slave)，第一个 ssh 里面的 bash 读到了这个输入，并显示在屏幕上。 但为什么是第一个 ssh 里面的 bash 呢？
