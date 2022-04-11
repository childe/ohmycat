---

layout: post
date: 2020-04-22T12:00:16+0800
title: 二分查找拐点的一个问题

---

题目: 一个先升序再降序的数组, 二分查找拐点位置

方法2跑了更多的分支, 但是时间却比较短. 为什么呢?

<!--more-->


```
package main

import (
	"testing"
	"time"
)

func binsearch(nums []int) (idx int, count int) {
	s := 0
	e := len(nums) - 1
	var m int
	for s < e {
		m = (s + e + 1) / 2
		count++
		if nums[m] > nums[m-1] {
			s = m
		} else {
			e = m - 1
		}
	}

	return s, count
}

func binsearch2(nums []int) (idx int, count int) {
	s := 0
	e := len(nums) - 1
	var ee int = e
	var m int = 0
	for s < e {
		m = (s + e + 1) / 2
		count++
		if nums[m] > nums[m-1] {
			count++
			if m == ee || nums[m] > nums[m+1] {
				return m, count
			}
			s = m
		} else {
			e = m - 1
		}
	}

	return s, count
}

func createTestData(n int) [][]int {
	testData := make([][]int, n)
	for i := range testData {
		sortNums := make([]int, n)
		for j := 0; j < i; j++ {
			sortNums[j] = j
		}
		for j := i; j < n; j++ {
			sortNums[j] = i + n - j
		}
		testData[i] = sortNums
	}
	return testData
}

func main() {
	testData := createTestData(1024)

	var s, e int64

	s = time.Now().UnixNano()
	var totalCount int = 0
	for i := 0; i < 1000; i++ {
		for _, nums := range testData {
			_, count := binsearch(nums)
			totalCount += count
		}
	}
	e = time.Now().UnixNano()

	println(totalCount)
	println(e - s)

	s = time.Now().UnixNano()
	totalCount = 0
	for i := 0; i < 1000; i++ {
		for _, nums := range testData {
			_, count := binsearch2(nums)
			totalCount += count
		}
	}

	e = time.Now().UnixNano()
	println(totalCount)
	println(e - s)
}

func BenchmarkBinSearch(b *testing.B) {
	testData := createTestData(1024)

	b.ResetTimer()
	var totalCount int = 0
	for i := 0; i < b.N; i++ {
		for _, nums := range testData {
			_, count := binsearch(nums)
			totalCount += count
		}
	}
	//println(totalCount)
}

func BenchmarkBinSearch2(b *testing.B) {
	testData := createTestData(1024)

	b.ResetTimer()
	var totalCount int = 0
	for i := 0; i < b.N; i++ {
		for _, nums := range testData {
			_, count := binsearch2(nums)
			totalCount += count
		}
	}
	//println(totalCount)
}
```

方法2跑了更多的分支, 但是时间却比较短. 为什么呢?
