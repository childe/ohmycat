---

date: 2019-05-09T13:59:01+0800
title: defer里面的值何时evaluate
layout: post

---

## 第一个问题

我在写这个的时候只是想记录一下像标题中说的, defer里面的值何时evaluate, 就像下面这一个例子. 

例子来自于 [https://groups.google.com/forum/#!topic/golang-nuts/c7YUK65Xqgs%5B1-25%5D](https://groups.google.com/forum/#!topic/golang-nuts/c7YUK65Xqgs%5B1-25%5D)

```
package main
import (
    "fmt"
)
func main() {
    for i := 0; i < 10; i++ {
        defer func() {
            fmt.Printf("func(): %v\n", i)
        }()
        defer printi(i)
        defer fmt.Printf("i: %v\t", i)
    }
}
func printi(i int) {
    fmt.Printf("printi(): %v\t", i)
}
```

结果是这样的

```
OUTPUT
======
i: 9	printi(): 9	func(): 10 
i: 8	printi(): 8	func(): 10 
i: 7	printi(): 7	func(): 10 
i: 6	printi(): 6	func(): 10 
i: 5	printi(): 5	func(): 10 
i: 4	printi(): 4	func(): 10
 i: 3	printi(): 3	func(): 10
 i: 2	printi(): 2	func(): 10 
i: 1	printi(): 1	func(): 10 
i: 0	printi(): 0	func(): 10
```

有趣的是, 匿名函数里面的输出和Print(也就是非匿名函数)里面的输出是不一样的. 这里可以用一个原因来解决(有种大统一理论的感觉不... )

二楼的 *emepyc* 说的很清楚, 我也不画蛇添足了, 直接复制过来

```
The key point is that the arguments to the deferred functions are 
evaluated and copied in the invocation of the defer. So: 

 >          defer  func()  { 
 >              fmt.Printf("func():  %v\n",  i) 
 >          }() 

No arguments to func(), so i is not copied and the final value of i is 
used when the deferred function is executed. 

 >          defer  printi(i) 
 >          defer  fmt.Printf("i:  %v\t",  i) 

In both cases, i is the argument of the deferred function, so its value 
is copied and used when the deferred function is evaluated. 
```

## 第二个问题

第二个问题, 在我看完之后, 并看了相关的链接资料, 发现是第一个问题的超集.

先来看一下原问题, [https://stackoverflow.com/questions/51360229/the-deferred-calls-arguments-are-evaluated-immediately](https://stackoverflow.com/questions/51360229/the-deferred-calls-arguments-are-evaluated-immediately)

这个回答里面也给出了 golang 官方资料关于 defer 的链接, 我之前在 google 搜索 `golang defer` 在第一页居然没有出现这个官方链接 .. [https://golang.org/ref/spec#Defer_statements](https://golang.org/ref/spec#Defer_statements) . 官方资料里面言简意赅的解释了 defer 的执行规则, 但是... 如果不能精确理解其中一些术语的话, 会看的很不明白, 比如我..

由三句话组成, 分别对应三个执行规则.

1. Each time a "defer" statement executes, the function value and parameters to the call are evaluated as usual and saved anew but the actual function is not invoked. 
2. Instead, deferred functions are invoked immediately before the surrounding function returns, in the reverse order they were deferred. That is, if the surrounding function returns through an explicit return statement, deferred functions are executed after any result parameters are set by that return statement but before the function returns to its caller. 
3. If a deferred function value evaluates to nil, execution panics when the function is invoked, not when the "defer" statement is executed.

写 Blog 真的还挺累(麻烦)的, 具体的意思我就不再解释了. [https://stackoverflow.com/questions/51360229/the-deferred-calls-arguments-are-evaluated-immediately](https://stackoverflow.com/questions/51360229/the-deferred-calls-arguments-are-evaluated-immediately)这里对第一点, 第二点, 都有很好的解释了.
