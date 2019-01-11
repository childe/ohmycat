---

title: golang json解析字符串BUG?
date: 2019-01-11T14:04:15+0800
layout: post

---

```
package main

import (
	"encoding/json"
	"fmt"
	"strings"
)

func main() {
	s := `null abcdefg hijklml`
	rst := map[string]interface{}{"x": "y"}
	d := json.NewDecoder(strings.NewReader(s))
	err := d.Decode(&rst)
	fmt.Println(err)
	fmt.Println(rst)
}
```
