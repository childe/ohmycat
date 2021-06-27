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

os.Stdin 其实是一个 pty -- pseudo terminal driver.

man page 里面写到, pty 是一对 character devices , 一个称之为 master device , 一个叫 slave device. slave device 给程序提供了一个接口. 真正的 terminal 后面是有一个设备处理输入的, 但 pty 后面是 master device 来处理.

对 pty 做了三个测试, 有些不明白.

## 测试1

SSH 登陆到一台机器 , tty 看到他的是 pty 是 /dev/pts/0 . 我就在当前屏幕敲字母, 会一个个打印出来(废话). 我的理解是, 我在键盘敲字母, 这是输入, 输入到 /dev/pts/0 . 输出到 /dev/pts/0 , 表现就是在当前屏幕打印出来. 这也是我们平时司空见惯的表现.

## 测试2

另外开一个 SSH 登陆到同一台机器, 运行 `cat /dev/pts/0` . 然后在前一个SSH 里面敲字母, 这时候可以看到敲的字母会一个出现在当前屏幕, 下一个出现在新的 SSH 屏幕, 交替出现. 我的理解是, 我在键盘敲字母, 这是输入, 输入到 /dev/pts/0 . 输出到 /dev/pts/0, 但 /dev/pts/0 被两个进程读取(一个是前一个 SSH 的 Bash, 另外一个是 CAT), 所以交替出现在两边.

## 测试3

再开一个 SSH 登陆到同一台机器, 运行 `date > /dev/pts/0` , 可以看到日期输出到了第一个 SSH 里面. 此时第二个 SSH 里面的 CAT 还在运行着, 但并没有捕获任何输出.  我的理解: 没能理解.
