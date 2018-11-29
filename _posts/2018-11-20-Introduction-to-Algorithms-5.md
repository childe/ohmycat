---

title: 算法导论学习笔记5 随机算法
layout: post
date: 2018-11-29T09:54:31+0800

---

## 5.3-1

我觉得Marceau教授说的挺有道理. 我的想法是把i=2的时候做为初始状态, 只要证明交换过A[1]之后, 每种可能的子数组A[1..1]的概率是1/n. 这个结论应该是"明显"的.

## 5.3-2

按我的理解应该是不可以的. 如果初始的时候, 第一个数字是X的概率小, 那么程序跑完之后, 第一个数字不是X的概率就会变大, 而不 1/n 了.

我们来写程序来验证一下 5.3-1 和 5.3-2 的结果吧.

```
package main

import (
	"fmt"
	"math/rand"
	"time"
)

func shuffle(array []int) {
	rand.Seed(time.Now().UnixNano())

	var (
		tmp   int
		index int
		n     = len(array)
	)

	for i := 0; i < n; i++ {
		index = rand.Intn(n-i) + i
		tmp = array[index]
		array[index] = array[i]
		array[i] = tmp
	}
}

func generate_array(n int) []int {
	array := make([]int, n)
	for i := 0; i < n; i++ {
		array[i] = i
	}
	return array
}

func main() {
	var (
		loop = 6000
		N    = 3
	)

	for i := 0; i < loop; i++ {
		array := generate_array(N)
		shuffle(array)
		fmt.Printf("%v\n", array)
	}
}
```

看5.3-1的结果, 还是很平均的.

```
% go run 5.3.1.go | sort | uniq -c
 990 [0 1 2]
1038 [0 2 1]
 965 [1 0 2]
 991 [1 2 0]
1002 [2 0 1]
1014 [2 1 0]
```

5.3-2的结果, 第一位永远不是0

```
package main

import (
	"fmt"
	"math/rand"
	"time"
)

func shuffle(array []int) {
	rand.Seed(time.Now().UnixNano())

	var (
		tmp   int
		index int
		n     = len(array)
	)

	for i := 0; i < n-1; i++ {
		index = rand.Intn(n-i-1) + i + 1
		tmp = array[index]
		array[index] = array[i]
		array[i] = tmp
	}
}

func generate_array(n int) []int {
	array := make([]int, n)
	for i := 0; i < n; i++ {
		array[i] = i
	}
	return array
}

func main() {
	var (
		loop = 6000
		N    = 3
	)

	for i := 0; i < loop; i++ {
		array := generate_array(N)
		shuffle(array)
		fmt.Printf("%v\n", array)
	}
}
```

```
% go run 5.3.2.go | sort | uniq -c
2951 [1 2 0]
3049 [2 0 1]
```

## 5.3-3

这些题目.. 都是谁想来杀我脑细胞的..

完全用教材中的示例去套已经不行了, 得到的结果貌似是"不能证明". 但是直觉感觉是可以的. 先放下, 来写个程序验证下吧.

```
package main

import (
	"fmt"
	"math/rand"
	"time"
)

func shuffle(array []int) {
	rand.Seed(time.Now().UnixNano())

	var (
		tmp   int
		index int
		n     = len(array)
	)

	for i := 0; i < n-1; i++ {
		index = rand.Intn(n)
		tmp = array[index]
		array[index] = array[i]
		array[i] = tmp
	}
}

func generate_array(n int) []int {
	array := make([]int, n)
	for i := 0; i < n; i++ {
		array[i] = i
	}
	return array
}

func main() {
	var (
		loop = 6000
		N    = 3
	)

	for i := 0; i < loop; i++ {
		array := generate_array(N)
		shuffle(array)
		fmt.Printf("%v\n", array)
	}
}
```

运行结果

```
% go run 5.3.3.go | sort | uniq -c
1316 [0 1 2]
 689 [0 2 1]
1331 [1 0 2]
1309 [1 2 0]
 682 [2 0 1]
 673 [2 1 0]
```

果然不行.. 想了一会, 用一个反例来说明吧.

比如 0 1 2 这三个排列好的数字, 用5.3.3的程序来跑, 我们来算一下跑完之后2出现在第一位的概率, 是 4/27 . 这样应该能证明这个算法是错误的了. 和我最开始的直觉是反过来的.
