---

layout: post
title: 函数中传递指针引起的一个BUG
date: 2018-06-13 15:40:50 +0800

---

我是觉得编程里面最烧脑的就是传值和传引用的甄别, 一不小心就会出错.

我是写一个kafka lib [https://github.com/childe/healer](https://github.com/childe/healer), producer的类写好了, 然后在此基础上写一个可执行文件, 从stdin输入数据, 然后写入kafka.

简单说一下producer逻辑, 输入1000条之后做为一批数据一起写kafka, 或者是200ms定时器到了就写, 哪怕没有1000条.

但是在测试过程中, 无意间发现, 最终写到kafka的数据是错乱的, 后面写的数据会把前面的数据覆盖掉. 比如先输入 1111111111, 再输入 2222222222, 最后写到kafka的就是两条 2222222222

这就让人很尴尬了...

<!--more-->

DEBUG的过程挺有(ruo)劲(bi)的, 但是事情过去有段时间了, 具体过程我也记不全了, 有一点算是比较有趣的地方, 下面会提到.

写一段代码模拟一下吧, 从stdin输入, 每5行输入一次.

```
package main

import (
	"bufio"
	"fmt"
	"io"
	"os"
)

type Producer struct {
	textBatch [][]byte
}

func (p *Producer) AddMessage(text []byte) {
	p.textBatch = append(p.textBatch, text)
	if len(p.textBatch) >= 5 {
		for _, t := range p.textBatch {
			fmt.Println(string(t))
		}
		p.textBatch = nil
	}
}

func main() {
	var (
		text     []byte    = nil
		line     []byte    = nil
		isPrefix bool      = true
		err      error     = nil
		producer *Producer = &Producer{}
	)
	reader := bufio.NewReader(os.Stdin)
	for {
		text = nil
		isPrefix = true
		for isPrefix {
			line, isPrefix, err = reader.ReadLine()
			if err == io.EOF {
				os.Exit(0)
			}

			if text == nil {
				text = line
			} else {
				text = append(text, line...)
			}
		}
		producer.AddMessage(text)
	}
}
```

运行结果 (前面5行是我的输入, 后面5行是输出)

```
% go run a.go
1
2
3
4
5
5
5
5
5
5
```

上面提到一点有趣的地方是这样的, 运行如下, 就是说如果不是从标准输入读数据, 而是CAT管道给程序, 输出是正确的.

```
% cat a
1
2
3
4
5

% cat a | go run a.go
1
2
3
4
5
```

原因是两点造成的

1. 传递 []byte 类型的时候, 传递的是指针, 而不是[]byte的copy.  (string是传value, 对原string的copy)
2. `reader := bufio.NewReader(os.Stdin)` , 这里生成的reader对象, 里面自己维护一个[]byte, 读到的数据会放在[]byte里面. 第二次读到的数据把第一次的覆盖了. `producer.AddMessage` 其实每次都传递了同一个[]byte指针过去. 在读入第二行数据的时候, 第一行的内容已经永远的消失了. 在最后打印的时候, 打印出来的全是同一个指针下的内容, 也就是'5'

为什么 `cat a | go run a.go` 可以"正确"输出, 是因为管道的时候, 数据是五行一次batch到下游的, 就是说, reader一次性读到了五行数据, 所以没有体现出来数据被覆盖. 一个类似的问题参见 [https://stackoverflow.com/questions/5427483/why-no-output-is-shown-when-using-grep-twice](https://stackoverflow.com/questions/5427483/why-no-output-is-shown-when-using-grep-twice)


今天的节目就到这里了, 大家晚安.
