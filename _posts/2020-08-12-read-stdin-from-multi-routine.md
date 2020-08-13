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

在 MAC 上的输出:

```
% while true ; do date ; sleep 1 ; done | go run a.go                                              1 ↵
1 Wed Aug 12 11:04:51 CST 2020
0 Wed Aug 12 11:04:52 CST 2020
1 Wed Aug 12 11:04:53 CST 2020
0 Wed Aug 12 11:04:54 CST 2020
1 Wed Aug 12 11:04:55 CST 2020
0 Wed Aug 12 11:04:56 CST 2020
```

在 MAC 上跑 Docker, alpha:3.9.4 输出

```
/tmp # while true ; do date ; sleep 1; done | ./a
1: Thu Aug 13 03:04:17 UTC 2020
0: Thu Aug 13 03:04:18 UTC 2020
0: Thu Aug 13 03:04:19 UTC 2020
1: Thu Aug 13 03:04:20 UTC 2020
1: Thu Aug 13 03:04:21 UTC 2020
1: Thu Aug 13 03:04:22 UTC 2020
0: Thu Aug 13 03:04:23 UTC 2020
1: Thu Aug 13 03:04:24 UTC 2020
0: Thu Aug 13 03:04:25 UTC 2020
1: Thu Aug 13 03:04:26 UTC 2020
0: Thu Aug 13 03:04:27 UTC 2020
0: Thu Aug 13 03:04:28 UTC 2020
1: Thu Aug 13 03:04:29 UTC 2020
^C
```
