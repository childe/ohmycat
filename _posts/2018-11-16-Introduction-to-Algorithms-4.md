---

title: 算法导论 笔记4 5.2-指示器随机变量
date: 2018-11-16T17:19:41+0800
layout: post

---

看完之后, 还一时不能熟练理解和应用

## 5.2-1

正好雇一次的概率是, 最优秀的人出现在第一个的概率, 就是 1/n

雇佣n次的概率是, 所有人正好按从弱到强来面试的概率, 是 1/n!

## 5.2-2

比如有n个面试者, 第一个出现的肯定要被录取, 设第一个的能力排名是i . 那后面的n-1个人里面, 第 i+1 名之后的这些人, 怎么出现都无所谓, 因为他们肯定不会被录取了. 就看排名在 i 之前的这些人, 一共有 i-1 个人, 他们需要满足且仅需要满足: 排名第1的那个人最先出现,  概率是 1/(i-1)

所以如果第一个人是第2名(概率是1/n), 那么后面录取一个人概率是 1/1,  
如果第一个人是第3名(概率是1/n), 那么后面录取一个人概率是 1/2  
如果第一个人是第4名(概率是1/n), 那么后面录取一个人概率是 1/3  
...  
如果第一个人是第n名(概率是1/n), 那么后面录取一个人概率是 1/(n-1)

所以总的概率是 (1+1/2+1/3+...+1/(n-1))/n

我们来模拟一下吧, 看看这个结果对不对.

写一个go的程序, 来输出一下理论上的概率值, 以及模拟出来的"真实"概率.  (概率乘了人数 n 然后输出的, 为了和后面提到的欧拉公式做验证)

```
package main

import (
	"flag"
	"fmt"
	"math/rand"
	"time"
)

func P(n int) float32 {
	var s float32 = 0.0
	for i := 2; i <= n; i++ {
		s += 1 / float32(i-1)
	}
	return s / float32(n)
}

func interview(candidates []int) int {
	var (
		best            = 0
		hire_loop_count = 0
	)
	for _, c := range candidates {
		if c > best {
			best = c
			hire_loop_count++
		}
	}
	return hire_loop_count
}

func generate_candidates(n int) []int {
	var (
		candidates = make([]int, 0)
		exist      = make(map[int]bool)
		candidate  int
	)
	for len(candidates) < n {
		candidate = rand.Intn(5*n) + 1
		if _, ok := exist[candidate]; ok {
			continue
		} else {
			exist[candidate] = true
			candidates = append(candidates, candidate)
		}
	}
	return candidates
}

var (
	loop_count int
	N          int
)

func init() {
	rand.Seed(time.Now().Unix())

	flag.IntVar(&loop_count, "loop-count", 100, "")
	flag.IntVar(&N, "N", 100, "")
	flag.Parse()
}
func main() {

	// theory
	for n := 2; n < N; n++ {
		p := P(n)
		fmt.Printf("%d %f %f\n", n, p, p*float32(n))
	}
	return

	// real
	var candidates []int
	for n := 2; n <= N; n++ {
		c := 0
		for i := 0; i < loop_count; i++ {
			candidates = generate_candidates(n)
			if interview(candidates) == 2 {
				c++
			}
		}
		fmt.Printf("%d %d %f\n", n, c, float32(c)/float32(loop_count)*float32(n))
	}
}
```

然后用python+plt把图画出来看一下.

![5.2.2](/images/5.2.2.png)

绿色是真实的数据, 红色是理论数据(1+1/2+...+1/(n-1))算出来的, 蓝色是欧拉公式算出来的. 还是符合的不错的. 欧拉公式参考[https://zh.wikipedia.org/wiki/调和级数](https://zh.wikipedia.org/wiki/%E8%B0%83%E5%92%8C%E7%BA%A7%E6%95%B0)
