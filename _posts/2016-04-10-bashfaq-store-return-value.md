---
layout: post
title:  "如何保存命令的返回值到一个变量中"
date:   2016-04-10 21:27:21 +0800
modify:   2016-04-10 21:27:21 +0800
abstract:   "
<p>翻译自<a href=http://mywiki.wooledge.org/BashFAQ/002>http://mywiki.wooledge.org/BashFAQ/002</a></p>
<p>保存stdout, 并保存返回码</p>
<p>保存stderr, 忽略stdout</p>
<p>保存stderr, stdout正常输出到原有的地方</p>
<p>感觉就是各种逻辑游戏, 挺有意思的</p>
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

好, 现在来看一些更复杂的问题: 如果只想要错误输出, 而不想要标准输出. 首先, 你需要决定把标准输出指向哪里去.

```sh
output=$(command 2>&1 >/dev/null)  # Save stderr, discard stdout.
output=$(command 2>&1 >/dev/tty)   # Save stderr, send stdout to the terminal.
output=$(command 3>&2 2>&1 1>&3-)  # Save stderr, send stdout to script's stderr.
```

最后一个有些难以理解. 首先要了解 `1>&3-` 等价于`1>&3 3>&-`. 然后按下表中的顺序理一下

|Redirection | fd 0 (stdin) | fd 1 (stdout) | fd 2 (stderr) | fd 3 | Description
|----------- | ------------ | ------------- | ------------- | ---- | -----------|
initial | /dev/tty | /dev/tty | /dev/tty | | 假设命令是跑在一个终端. stdin stdout stder全部都是初始化为指向终端(tty)
$(...) | /dev/tty | pipe | /dev/tty | | 标准输出被管道捕获
3>&2 | /dev/tty | pipe | /dev/tty | /dev/tty | 把描述符2复制到新建的一个描述3, 这时候描述符3指向标准错误输出
2>&1 | /dev/tty | pipe | pipe | /dev/tty | 描述符2指向1当前的指向, 也就是说2和1一起都是被捕获
1>&3 | /dev/tty | /dev/tty | pipe | /dev/tty | 复制3到1, 也就是说描述符1指向了标准错误. 到现在为止, 我们已经交换了1和2 
3>&- | /dev/tty | /dev/tty | pipe | | 最后关闭3, 已经不需要了

**n>&m- 有时候称之为 将m 重命名为n.**

来个更复杂的! 我们把stder保存下来, stdout还是往之前应该去的地方去, 就好像stdout没有做过任何的重定向.

有两种方式

```sh
exec 3>&1                    # Save the place that stdout (1) points to.
output=$(command 2>&1 1>&3)  # Run command.  stderr is captured.
exec 3>&-                    # Close FD #3.

# Or this alternative, which captures stderr, letting stdout through:
{ output=$(command 2>&1 1>&3-) ;} 3>&1
```

**我觉得有必要说明一下带重定向的命令的执行方式. `command 2>&1 1>&3` 是先把2指向1, 然后把1指向3**

第一种方式应该还比较好懂. 先创建FD3,并把1复制到3, 然后执行命令 `$(command 2>&1 1>&3)` , 把FD1的输出管道给output, 然后把3关闭.

第二种方式, 其实就是把三行合成为1行了.


如果想分别保存stdout, stderr到2个变量中, 只用FD是做不到的. 需要用到一个临时文件, 或者是命名的管道.

一个很糟糕的实现如下:

```sh
result=$(
    { stdout=$(cmd) ; } 2>&1
        printf "this line is the separator\n"
            printf "%s\n" "$stdout"
            )
var_out=${result#*this line is the separator$'\n'}
var_err=${result%$'\n'this line is the separator*}
```

如果还想保存返回码的话

```sh
cmd() { curl -s -v http://www.google.fr; }

result=$(
    { stdout=$(cmd); returncode=$?; } 2>&1
        printf "this is the separator"
            printf "%s\n" "$stdout"
                exit "$returncode"
                )
returncode=$?

var_out=${result#*this is the separator}
var_err=${result%this is the separator*}
```

Done.
