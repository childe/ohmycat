---

date: 2019-12-20T17:06:49+0800

---

reflect_test.go

```go
package main

import "testing"

type A struct {
	name string
}

type SetNamer interface {
	SetName()
}

func (a *A) SetName() {
	a.name = "a"
}

func getA() *A {
	return &A{}
}
func getI() SetNamer {
	return &A{}
}

func BenchmarkA(b *testing.B) {
	a := &A{}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		a.SetName()
	}
	print(a.name)
}

func BenchmarkB(b *testing.B) {
	var s SetNamer = &A{}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s.SetName()
	}
}

func BenchmarkC(b *testing.B) {
	a := getA()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		a.SetName()
	}
	print(a.name)
}

func BenchmarkD(b *testing.B) {
	s := getI()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s.SetName()
	}
}
```

测试结果:

```
% go test -bench=. -cpu=1
agoos: darwin
goarch: amd64
BenchmarkA 	aaaaa1000000000	         0.574 ns/op
BenchmarkB 	537799974	         2.17 ns/op
aBenchmarkC 	aaaaa1000000000	         0.571 ns/op
BenchmarkD 	545279128	         2.22 ns/op
PASS
ok  	_/private/tmp/1576831712	4.101s
```

同样一个 value a, 或者它的申明类型是 struct A , 调用 a.SetName 速度要**快**很多

相比这下, 如果申明类型是 interface SetNamer, 调用 s.SetName 速度要**慢**非常多
