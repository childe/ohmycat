---
layout: post
title:  "如何保存命令的返回值到一个变量中"
date:   2016-04-10 21:27:21 +0800
modify:   2016-04-10 21:27:21 +0800
abstract:   "
<p>翻译自http://mywiki.wooledge.org/BashFAQ/002</p>
<p>这个取决于你是想保存命令的输出,还是他的返回码(0到255, 一般来说0代表成功)</p.
"
keywords: bash bashfaq linux
categories: bash linux
---

翻译自[http://mywiki.wooledge.org/BashFAQ/002](http://mywiki.wooledge.org/BashFAQ/002)

如何保存命令的返回值到一个变量中, 这个取决于你是想保存命令的输出,还是他的返回码(0到255, 一般来说0代表成功).

如果是想捕获输出, 可以用[command substitution](http://mywiki.wooledge.org/CommandSubstitution)

```sh
output=$(command)      # stdout only; stderr remains uncaptured
output=$(command 2>&1) # both stdout and stderr will be captured
```

如果是想要返回码, 应该在运行命令之后, 用特殊参数 $?

```sh
command
status=$?
```

如果两者都需要:

```sh
output=$(command)
status=$?
```

如果不是想要返回码, 而只是想知道命令成功还是失败, 可以如下这样

```sh
if command; then
    printf "it succeeded\n"
else
    printf "it failed\n"
fi
```

如果要根据成功/失败执行下一步操作, 但不想知道返回码, 又要取输出内容:

```sh
if output=$(command); then
    printf "it succeeded\n"
    ...
```

如果想从一个pippline里面获取其中一个command的返回码? 最后一个的话, 就是 $? . 如果是中间某个呢? 用PIPESTATUS数组(只在bash中有效)

```sh
grep foo somelogfile | head -5
status=${PIPESTATUS[0]}
```


bash3.0 又添加了一个pipefail选项, 如果你想grep失败的时候执行下一步:

```sh
set -o pipefail
if ! grep foo somelogfile | head -5; then
    printf "uh oh\n"
fi
```
