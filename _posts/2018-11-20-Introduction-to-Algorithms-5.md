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
% go run 5.3.3.go | sort | uniq -c | sort -k2
 892 [0 1 2]
1157 [0 2 1]
1073 [1 0 2]
1123 [1 2 0]
 864 [2 0 1]
 891 [2 1 0]
```

第一位是2的概率小一些.. 想了一会, 用一个反例来证明这个办法不行吧.

比如 0 1 2 这三个排列好的数字, 用5.3.3的程序来跑, 我们来算一下跑完之后2出现在第一位的概率, 是 4/27 . 这样应该能证明这个算法是错误的了. 我最开始的直觉是错的.

又想了一会, 想到一个更好些的证明吧.

不失普遍性, 我们假设n=10好了. 在进行到最后一步的时候, 设特定的数字x(比如说1)出现在第1位的概率是p, 那么最后一步进行之后, x在第一位的概率是 p\*9/10 , p\*9/10=1/10 => p=1/9. 同理, x出现在第2-9位的概率也是1/9, 加起来的概率为1, 也就是说x出现在最后的概率需要为0, 显然前面进行的操作到最后一步时, 满足不了x在最后出现的概率为0, 那也保证不了最后一步之后, 这个数列是个随机数列.

## 5.3-4

我看教材的时候, 里面说, 如果数列中的每一个特定的数字出现在一个特定位子的概率都是1/n, 也不能保证他就是一个随机数组, 我就想这会是什么情况呢? 这个题目给出了一个简单又有力的反例.

如果初始数组不是随机的, 比如是0,1,2,3,4,5,6,7,8,9, 那么这个算法过后, 每个元素A[i]出现在任意特定位置的概率都是1/n (因为offset是1-n中每个数字的概率就是1/n), 但他显然不是随机数组, 因为初始数列的排列并没有打乱.

## 5.3-5

优先级数列中, 每个数字都不一样的概率如下, 记`N=n**3`, 则概率为 `p=(N-1)*(N-2)*(N-3)*...*(N-n)/N**n` , `p > (N-n)**n/N**n = ((N-n)/N)**n = (1-n/N)**n` , 只需要证明 `(1-1/n**2)**n > 1-1/n` , 这个不知道怎么证明, 只是写程序看出来, 这里的2不能再小了, 哪怕小于1.99, 这个不等式也是不成立的. #TODO#
