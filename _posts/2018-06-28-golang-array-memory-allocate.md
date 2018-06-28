---

layout: post
title: golang里面array/slice的内存分配测试1
date: 2018-06-28T11:33:30+0800

---

1. 当cap还够用的时候, append不会申请新内存
2. cap不够的时候, 会申请一块新内存. buf = append(buf, ...), 新得到的buf会是一块新内存,指针是变掉的, 新的cap是之前的两倍(但一定是8的倍数, 比如2->8)
3. newbuf = buf[2:5] 生成slice的时候, newbuf指向buf[2], 他们共用同一块内存, 直到上面2中描述的新内存申请后, 他们会指向不同内存. 不管是buf还是newbuf扩容

```
package main

import "fmt"

func main() {
	buf := make([]byte, 4)
	buf[0] = 'a'
	buf[1] = 'b'
	buf[2] = 'c'
	buf[3] = 'd'
	fmt.Println(len(buf))
	fmt.Println(cap(buf))
	fmt.Println()

	newbuf := buf[1:]
	fmt.Println(len(buf))
	fmt.Println(cap(buf))
	fmt.Println(len(newbuf))
	fmt.Println(cap(newbuf))
	fmt.Println(string(buf))
	fmt.Println(string(newbuf))
	fmt.Printf("%p\n", &buf[1])
	fmt.Printf("%p\n", &newbuf[0])
	fmt.Printf("%v\n", &buf[1] == &newbuf[0])
	fmt.Println()

	newbuf = append(newbuf, 'x')
	fmt.Println(len(buf))
	fmt.Println(cap(buf))
	fmt.Println(len(newbuf))
	fmt.Println(cap(newbuf))
	fmt.Println(string(buf))
	fmt.Println(string(newbuf))
	fmt.Printf("%p\n", &buf[1])
	fmt.Printf("%p\n", &newbuf[0])
	fmt.Printf("%v\n", &buf[1] == &newbuf[0])
	fmt.Println()

	newbuf[0] = 'y'
	fmt.Println(len(buf))
	fmt.Println(cap(buf))
	fmt.Println(len(newbuf))
	fmt.Println(cap(newbuf))
	fmt.Println(string(buf))
	fmt.Println(string(newbuf))
	fmt.Printf("%p\n", &buf[1])
	fmt.Printf("%p\n", &newbuf[0])
	fmt.Printf("%v\n", &buf[1] == &newbuf[0])
}
```

运行结果

```
4
4

4
4
3
3
abcd
bcd
0xc42001609d
0xc42001609d
true

4
4
4
8
abcd
bcdx
0xc42001609d
0xc4200160f0
false

4
4
4
8
abcd
ycdx
0xc42001609d
0xc4200160f0
false
```


```
package main

import "fmt"

func main() {
	buf := make([]byte, 400)
	buf[0] = 'a'
	buf[1] = 'b'
	buf[2] = 'c'
	buf[3] = 'd'
	fmt.Println(len(buf))
	fmt.Println(cap(buf))
	fmt.Println()

	newbuf := buf[1:10]
	fmt.Println(len(buf))
	fmt.Println(cap(buf))
	fmt.Println(len(newbuf))
	fmt.Println(cap(newbuf))
	fmt.Println(string(buf))
	fmt.Println(string(newbuf))
	fmt.Printf("%p\n", &buf[1])
	fmt.Printf("%p\n", &newbuf[0])
	fmt.Printf("%v\n", &buf[1] == &newbuf[0])
	fmt.Println()

	newbuf = append(newbuf, 'x')
	fmt.Println(len(buf))
	fmt.Println(cap(buf))
	fmt.Println(len(newbuf))
	fmt.Println(cap(newbuf))
	fmt.Println(string(buf))
	fmt.Println(string(newbuf))
	fmt.Printf("%p\n", &buf[1])
	fmt.Printf("%p\n", &newbuf[0])
	fmt.Printf("%v\n", &buf[1] == &newbuf[0])
	fmt.Println()

	newbuf[0] = 'y'
	fmt.Println(len(buf))
	fmt.Println(cap(buf))
	fmt.Println(len(newbuf))
	fmt.Println(cap(newbuf))
	fmt.Println(string(buf))
	fmt.Println(string(newbuf))
	fmt.Printf("%p\n", &buf[1])
	fmt.Printf("%p\n", &newbuf[0])
	fmt.Printf("%v\n", &buf[1] == &newbuf[0])
}
```

运行结果:

```
400
400

400
400
9
399
abcd
bcd
0xc420082001
0xc420082001
true

400
400
10
399
abcdx
bcdx
0xc420082001
0xc420082001
true

400
400
10
399
aycdx
ycdx
0xc420082001
0xc420082001
true
```
