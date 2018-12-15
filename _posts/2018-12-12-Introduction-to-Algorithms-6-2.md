---

title: 算法导论笔记 6.2 章 - 维护堆的性质
date: 2018-12-15T15:40:09+0800
layout: post

---

## 6.2-1

略

## 6.2-2

略

## 6.2-3

会停止比较, 不进入递归, 直接返回

## 6.2-4

因为 left 和 right 都大于 heap-size , 所以不会进去递归, 直接返回了

## 6.2-5

```
func max_heapify(A []int, i int) {
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
		} else if right < size && A[i] < A[right] {
			max = right
		}

		if max == i {
			return
		}
		A[i], A[max] = A[max], A[i]
		i = max
	}
}
```

## 6.2-6

对于已经倒排排序的数组A, 把A[-1]提到最前面, 这个时候, max_heapify 的运行时间就是 ln(n), 像 `[1,9,8,7,6,5,4,3,2]`
