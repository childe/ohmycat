---

layout: post
title: mmap中shared方式锁定的内存能否释放
date: 2018-08-03T16:03:08+0800

---

很多文章都提到 cache中的 shared memory的cache不能被释放, 比如[https://linux.cn/article-7310-1.html](https://linux.cn/article-7310-1.html), 那自然就有一个问题: 如果系统内存用完了, 程序继续通过share memory mmap读取数据, 会发生什么情况?

是老的cache被释放, 还是读取失败?

做了一下测试, 还是会释放的, 只不过不能通过 `echo 3 > /proc/sys/vm/drop_caches` 这种方式释放而已.

找一个4G内存的机器做下测试.

写了一段代码, mmap读取一个3G文件的每一页, 这样就会让文件常驻cache了. `echo 3 > /proc/sys/vm/drop_caches` 之后可以看到cahce没有少, vmtouch也可以看到未释放.

然后 `cat another-3G-file > /dev/null`,通过 vmtouch可以看到老文件已经有page不在cache中了. 而another-3G-file几乎全部在cache.
