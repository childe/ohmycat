---
layout: post
title:  "bash中将标准输出重定向到多处"
date:   2016-06-01 18:24:16 +0800
categories: os linux
---

`echo "abcd" 1>f1 1>f2 1>f3`, 我以为是后面的会覆盖前面的, 最后只是写到f3. 测试了一下居然不是, 就想了解一下到底发生了什么.  
观察了一下, 发现单次重定向和上面这种多次重定向, 居然是不一样的实现.

写一个简单的C程序, 做为输出源.

```c
#include <unistd.h>
#include <stdlib.h>

int main(int args, char** argv)
{
    int n = 8;
    char *buf = "abcdefg\n";
    char *buf2 = "1234567\n";
    write(STDOUT_FILENO, buf, n);
    write(STDERR_FILENO, buf2, n);

    sleep(100);
    exit(0);
}
```

最后sleep 100秒是为了方便观察fd情况.

## 单次重定向

    ./a.out >f1 2>f4

然后看一下f1 f4都被哪个进程占用:

>   COMMAND   PID   USER   FD   TYPE DEVICE SIZE/OFF   NODE NAME  
    a.out   22985 childe    1w   REG    8,1        8 412766 f1  
    a.out   22985 childe    2w   REG    8,1        8 412774 f4  

再看一下这个进程下的fd情况:

>   % ll /proc/23075/fd  
    total 0  
    lrwx------ 1 childe childe 64  6月  1 18:36 0 -> /dev/pts/10  
    l-wx------ 1 childe childe 64  6月  1 18:36 1 -> /tmp/m/f1  
    l-wx------ 1 childe childe 64  6月  1 18:36 2 -> /tmp/m/f4  


## 重定向多次

    ./a.out >f1 >f2 >f3 2>f4 2>f5 

**查看一下结果, 其实是zsh帮忙用pipe做了中间介质, 才把a.out的输出写到了多个文件.**

>   % lsof f1 f2 f3 f4 f5
    COMMAND   PID   USER   FD   TYPE DEVICE SIZE/OFF   NODE NAME  
    zsh     23227 childe   11w   REG    8,1        8 412766 f1  
    zsh     23227 childe   13w   REG    8,1        8 412767 f2  
    zsh     23227 childe   15w   REG    8,1        8 412769 f3  
    zsh     23228 childe   16w   REG    8,1        8 412774 f4  
    zsh     23228 childe   17w   REG    8,1        8 412775 f5  

>   % ll /proc/23226/fd
    lrwx------ 1 childe childe 64  6月  1 18:37 0 -> /dev/pts/10  
    l-wx------ 1 childe childe 64  6月  1 18:37 1 -> pipe:[95495]  
    l-wx------ 1 childe childe 64  6月  1 18:37 2 -> pipe:[95496]  

>   % ll /proc/23227/fd
    l-wx------ 1 childe childe 64  6月  1 18:37 11 -> /tmp/m/f1  
    l-wx------ 1 childe childe 64  6月  1 18:37 13 -> /tmp/m/f2  
    lr-x------ 1 childe childe 64  6月  1 18:37 14 -> pipe:[95495]  
    l-wx------ 1 childe childe 64  6月  1 18:37 15 -> /tmp/m/f3

>   % ll /proc/23228/fd
    l-wx------ 1 childe childe 64  6月  1 18:37 16 -> /tmp/m/f4  
    l-wx------ 1 childe childe 64  6月  1 18:37 17 -> /tmp/m/f5  
    lr-x------ 1 childe childe 64  6月  1 18:37 18 -> pipe:[95496]      
