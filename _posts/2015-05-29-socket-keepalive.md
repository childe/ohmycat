---
layout: post
title:  "从Kafka的一个BUG学到的TCP Keepalive"
date:   2015-05-29 16:00:45 +0800
abstract:   ""
categories: linux net
---

# Kafka Server Dead Socket 缓慢堆积
前段时间, 发现Kafka的死连接数一直上升, 从Kafka server这边看, 到其中一个client有几百个established connection, 但从client那边看, 其实只有1个到2个连接.

经过测试和搜索之后, 确定了是Kafka的一个BUG, 会在0.8.3版本修复, 不过目前还没有放出来.

这是一两个月之前,  有其他用户提出的反馈.

[http://comments.gmane.org/gmane.comp.apache.kafka.user/6899](http://comments.gmane.org/gmane.comp.apache.kafka.user/6899)

[https://issues.apache.org/jira/browse/KAFKA-2096](https://issues.apache.org/jira/browse/KAFKA-2096)


# TCP Socket Keepalive

其实我们几个月之前就发现了这个问题, 不过当时以为是客户端的配置错误(有很多client不停写一个带%字符的非法topic) 引起的.

关键是没有足够的知识储备, 如果之前就知道tcp的keep alive机制, 可能会早点反应过来.

记录一下刚学到的tcp keepalive机制.

主要参考了[http://www.tldp.org/HOWTO/html_single/TCP-Keepalive-HOWTO](http://www.tldp.org/HOWTO/html_single/TCP-Keepalive-HOWTO)

摘抄翻译几段吧.

## 什么是TCP Keepalive

当你建立一个TCP连接的时候, 就关联了一组定时器. 这里面有些定时器就是处理keepalive的, 它到达0的时候就会发送探针包到对方,看这个socket是不是还活着.探针包不包含数据, ACK标志为1. 不需要对方的socket也配置tcp keepalive.

如果收到对方回应,就可以断定这个连接还活着. 如果没有回应,可以断定连接已经不能用了, 可以不再维护了.

## 为啥需要keepalive

### 检查死连接
这个过程是非常有用的,因为一个所谓的TCP连接其实并没有任何一个东西连着两边. 如果一方突然断电了,另一方是不会知道的.或者中间某个路由表改了,又或者加了一个防火墙, 连接的两方是不会知道的.所以keepalive机制可以去除一些这样的死连接.

### 防止因为连接不活动而被中断

如果连接在一个NAT或者是防火墙后面, 那么一定时间不活动可能会被不经通知就断开.

NAT或者防火墙会记录经过他们的连接,但能记录的条数总归有个上限. 最普遍也是最合理的策略就是丢弃老的不活动的连接.

周期的发送一个探针可以把这个风险降低.

## Linux下使用keepalive

linux内建支持keepalive. 有三个相关的参数.

1. tcp_keepalive_time

    上次发送数据(简单的ACK不算)多久之后开始发送探针. 默认是2小时.

    当连接被标记为需要keepalive之后, 这个计数器就不再需要了(没理解啥意思)

2. tcp_keepalive_probes
    
    一共发多久次探针, 默认9次.

 
3. tcp_keepalive_intvl

    两个探针之间隔多久, 默认75秒

**注意**,  keepalive默认是不启用的,除非在建立socket的时候用setsockopt接口配置了这个socket. 过会给示例.

### 如何配置参数

有两个方法可以配置这三个参数 

#### proc文件系统

查看当前值:

      # cat /proc/sys/net/ipv4/tcp_keepalive_time
      7200
    
      # cat /proc/sys/net/ipv4/tcp_keepalive_intvl
      75
    
      # cat /proc/sys/net/ipv4/tcp_keepalive_probes
      9
  
  
更改配置:

      # echo 600 > /proc/sys/net/ipv4/tcp_keepalive_time
    
      # echo 60 > /proc/sys/net/ipv4/tcp_keepalive_intvl
    
      # echo 20 > /proc/sys/net/ipv4/tcp_keepalive_probes

#### sysctl命令

查看:

    # sysctl \
      > net.ipv4.tcp_keepalive_time \
      > net.ipv4.tcp_keepalive_intvl \
      > net.ipv4.tcp_keepalive_probes
      net.ipv4.tcp_keepalive_time = 7200
      net.ipv4.tcp_keepalive_intvl = 75
      net.ipv4.tcp_keepalive_probes = 9

更改配置:


      # sysctl -w \
      > net.ipv4.tcp_keepalive_time=600 \
      > net.ipv4.tcp_keepalive_intvl=60 \
      > net.ipv4.tcp_keepalive_probes=20
      net.ipv4.tcp_keepalive_time = 600
      net.ipv4.tcp_keepalive_intvl = 60
      net.ipv4.tcp_keepalive_probes = 20

#### sysctl系统调用

proc文件系统是内核在用户层的暴露, sysctl命令是对其进程操作的一个接口, 但它不是用的sysctl这个系统调用.

如果没有proc文件系统可以用, 这时候就要用sysctl系统调用来更改参数了. (应该就是写程序了吧~,具体怎么使用, man好了)

### 参数持久化

如果让更改后的参数在重启后依然有效?

一般来说, 就是把上面的命令写到启动脚本里面去. 有三个地方可以写.

1. 配置网络的地方
2.  rc.local脚本
3.  /etc/sysctl.conf  sysctl -p会加载/etc/sysctl.conf里面的配置,但请确保启动脚本里面会执行sysctl -p. 

更改的参数也会对已经建立的连接生效.

## 写程序时启用Keepalive

前面提到过, 默认是没有启用这个功能的. 需要在程序中对socket配置一下.

需要使用这个函数:

    int setsockopt(int s, int level, int optname,
                     const void *optval, socklen_t optlen)

第一个参数就是之前用socket函数得到的socket, 第二个参数一定要是SOL_SOCKET, 第三个参数一定要是SO_KEEPALIVE, 第四个参数是boolean int, 一般就是0或1吧. 第五个参数是第四个参数的大小. 后面有代码示例.

前面提到的三个参数也可以对一个单独的socket应用, 会覆盖全局的参数.

- TCP_KEEPCNT: overrides  tcp_keepalive_probes

- TCP_KEEPIDLE: overrides  tcp_keepalive_time

- TCP_KEEPINTVL: overrides  tcp_keepalive_intvl

代码示例:

```c

            /* --- begin of keepalive test program --- */

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>

int main(void);

int main()
{
   int s;
   int optval;
   socklen_t optlen = sizeof(optval);

   /* Create the socket */
   if((s = socket(PF_INET, SOCK_STREAM, IPPROTO_TCP)) < 0) {
      perror("socket()");
      exit(EXIT_FAILURE);
   }

   /* Check the status for the keepalive option */
   if(getsockopt(s, SOL_SOCKET, SO_KEEPALIVE, &optval, &optlen) < 0) {
      perror("getsockopt()");
      close(s);
      exit(EXIT_FAILURE);
   }
   printf("SO_KEEPALIVE is %s\n", (optval ? "ON" : "OFF"));

   /* Set the option active */
   optval = 1;
   optlen = sizeof(optval);
   if(setsockopt(s, SOL_SOCKET, SO_KEEPALIVE, &optval, optlen) < 0) {
      perror("setsockopt()");
      close(s);
      exit(EXIT_FAILURE);
   }
   printf("SO_KEEPALIVE set on socket\n");

   /* Check the status again */
   if(getsockopt(s, SOL_SOCKET, SO_KEEPALIVE, &optval, &optlen) < 0) {
      perror("getsockopt()");
      close(s);
      exit(EXIT_FAILURE);
   }
   printf("SO_KEEPALIVE is %s\n", (optval ? "ON" : "OFF"));

   close(s);

   exit(EXIT_SUCCESS);
}

            /* ---  end of keepalive test program  --- */
```

## 为第三方程序启用keepalive

如果别人的程序里面没有显式的启用keepalive, 你又想用, 怎么办呢? 两个办法.

1. 改它的代码, 重新编译运行.
2. 用libkeepalive这个项目.  它其实是在动态链接库里面更改了socket方法, 在socket之后就自动帮你调用了setsockopt. 所以如果可执行程序是用gcc -static编译出来的, 这个项目就帮不了你了.

使用libkeepalive的一个例子:

      $ test
      SO_KEEPALIVE is OFF
      
      $ LD_PRELOAD=libkeepalive.so \
      > KEEPCNT=20 \
      > KEEPIDLE=180 \
      > KEEPINTVL=60 \
      > test
      SO_KEEPALIVE is ON
      TCP_KEEPCNT   = 20
      TCP_KEEPIDLE  = 180
      TCP_KEEPINTVL = 60


# 还有个疑惑

最后再提一下, 我们的kafka client是启用了keepalive的, 为什么Server那边还有这么多死连接呢??

由抓包可以确认, 2h之后client的确是发送了探针包, 但奇怪的是server并没有收到,也抓包确认了.

能想到的一个原因是, 防火墙设置的超时时间小于2小时, 所以等到发送探针的时候连接已经断了, 包直接被防火墙丢弃.

但实际上不是这样的, 因为在1h50m左右的时候, 尝试发消息还是通的.

而且写了一个程序, 模拟(伪造)一个TCP包发送到kafka server. 结果是在某个网段发送时, server抓包抓到, 并回复了reset.  但在另外一个网段, server根本就没收到.

明天再继续跟进, 查一下为啥吧. 大概也是中间某个防火墙的策略把它丢弃了吧?
