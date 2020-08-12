---

date: 2020-08-12T11:05:36+0800

---

```
package main

import (
	"bufio"
	"fmt"
	"os"
)

func s(i int) {
	for {
		scanner := bufio.NewScanner(os.Stdin)
		scanner.Scan()
		t := scanner.Text()
		fmt.Printf("%v %v\n", i, t)
	}
}

func main() {
	c := make(chan struct{})
	for i := 0; i < 2; i++ {
		go s(i)
	}
	<-c
}
```

输出:

```
% while true ; do date ; sleep 1 ; done | go run a.go                                              1 ↵
1 Wed Aug 12 11:04:51 CST 2020
0 Wed Aug 12 11:04:52 CST 2020
1 Wed Aug 12 11:04:53 CST 2020
0 Wed Aug 12 11:04:54 CST 2020
1 Wed Aug 12 11:04:55 CST 2020
0 Wed Aug 12 11:04:56 CST 2020
```
