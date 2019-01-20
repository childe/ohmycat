---

title: 算法导论笔记 6-3 建堆
date: 2018-12-15T16:35:41+0800
layout: post

---

先写一个 go 语言的程序如下

```
package main

import (
	"fmt"
	"math"
	"math/rand"
	"strings"
	"time"
)

func maxHeapify(A []int, i int) {
	var (
		size  = len(A)
		left  int
		right int
		max   int
	)

	for {
		left = 2*i + 1
		right = 2*i + 2
		max = i

		if left < size && A[i] < A[left] {
			max = left
		}
		if right < size && A[max] < A[right] {
			max = right
		}

		if max == i {
			return
		}
		A[i], A[max] = A[max], A[i]
		i = max
	}
}

func buildMaxHeap(A []int) {
	length := len(A)
	for i := length/2 - 1; i >= 0; i-- {
		maxHeapify(A, i)
	}
}

func GA(N int) (A []int) {
	A = make([]int, 10)
	for i := 0; i < N; i++ {
		A[i] = N - i
	}
	A[0] = 0
	return
}
func RGA(N int) (A []int) {
	rand.Seed(time.Now().UnixNano())

	A = make([]int, 10)
	for i := 0; i < N; i++ {
		A[i] = rand.Intn(N * N)
	}
	return
}

func isHeap(A []int) bool {
	size := len(A)
	for i := 0; i < size; i++ {
		left := 2*i + 1
		right := 2*i + 1
		if left < size && A[left] > A[i] {
			return false
		}
		if right < size && A[right] > A[i] {
			return false
		}
	}
	return true
}

func printTree(A []int) {
	var (
		currentHeight      = 0
		startOfCurrentLine = 0
		height             = int(math.Ceil(math.Log2(float64(len(A)) + 0.5)))
	)
	for i := 0; i < len(A); i++ {
		if i == startOfCurrentLine {
			jstring := make([]string, height-currentHeight)
			for j := 0; j < height-currentHeight; j++ {
				jstring[j] = " "
			}
			currentHeight++
			fmt.Printf("\n%s", strings.Join(jstring, ""))
			startOfCurrentLine = 2*startOfCurrentLine + 1
		}
		fmt.Printf("%d ", A[i])
	}
	fmt.Println("\n")
}

func main() {
	count := 100
	for i := 0; i < count; i++ {
		A := RGA(10)
		//printTree(A)
		buildMaxHeap(A)
		fmt.Println(isHeap(A))
		//printTree(A)
	}
}
```


## 6.3-1

略

## 6.3-2

## 6.3-3
