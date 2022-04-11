---

layout: post
date: 2019-05-29T10:29:37+0800

---

下面这段代码是模拟一个工作任务: goroutine里面做任务, 主进程里面等任务完成才退出, 避免一个任务因进行中退出. 实际代码肯定会复杂, 这两种线程可能散落在多个文件中.

```
package main

import "sync"

var wg sync.WaitGroup

func work() {
	for {
		wg.Add(1)
		// ... work here
		// time.Sleep(time.Second)
		wg.Done()
	}
}

func main() {
	go work()
	defer wg.Wait()
}
```

乍一看好像也没问题, 但有小概率 Panic: WaitGroup is reused before previous Wait has returned.

直接google查了好几个文章都没解释为什么, 最后还是看官方文档找到解释. 官方文档好啊, 一定要花时间撸一遍才好.

	If a WaitGroup is reused to wait for several independent sets of events, new Add calls must happen after all previous Wait calls have returned.

上面代码中的 Wait 并不是原子操作, 可能 Wait 还没有结束的时候, 又再次调用到了 Add 方法, 这时候就会 Panic.
