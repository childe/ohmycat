---
layout: post
title:  "tcp/ip协议学习 第四章 ICMP:Internet控制报文协议"
date:   2014-12-18 01:54:50 +0800
modifydate:   2014-12-18 01:54:50 +0800
abstract:   "1. 在我看来, ICMP协议主要就是为了互相传递/查询一些基本信息, 大部分是传递一些错误信息.
<br>
比如A发送UDP信息到B的10000端口, 但B的10000端口并没有开放, 就会回一个ICMP包给A, 告诉A10000端口未开放.
<br>
基本的查询信息, 比如最常用的ping命令, 就是发送ICMP包到目的主机, 然后等待目的主机的响应(响应也是ICMP包).
<br>
2. 协议格式<br>
3. 代码示例
"
categories: net
---

[关于ICMP的RFC文档在此!](https://tools.ietf.org/html/rfc792) 

# 干嘛的
在我看来, ICMP协议主要就是为了互相传递/查询一些基本信息, 大部分是传递一些错误信息.

比如A发送UDP信息到B的10000端口, 但B的10000端口并没有开放, 就会回一个ICMP包给A, 告诉A10000端口未开放.

基本的查询信息, 比如最常用的ping命令, 就是发送ICMP包到目的主机, 然后等待目的主机的响应(响应也是ICMP包).

# 协议
协议定义的非常简单. ICMP在IP层上面一层. 前面是20个字节的IP头, 然后就是ICMP头.

**ICMP头, 截图来自TCP/IP协议详解卷一**
![ICMP头, 截图来自TCP/IP协议详解卷一](/images/icmp-header.png)

类型和代码两个字段的组合决定了这个ICMP包的用途, 比如我们常用的ping就是0,0组合和8,0组合. 具体如下:

**各种类型的ICMP报文, 截图来自TCP/IP协议详解卷一**
![各种类型的ICMP报文, 截图来自TCP/IP协议详解卷一](/images/icmp-type-code.png)

# 代码放上
好像没有什么好说的. 直接代码放上吧.
实现了一下书中的例子, 一个是查询子网掩码, 一个是查询时间.
[github地址, 点我点我](https://github.com/childe/tcpip-learning)

# 端口不可达
这也是书中的一个例子. 比如A发送UDP信息到B的10000端口, 但B的10000端口并没有开放, 就会回一个ICMP包给A, 告诉A10000端口未开放.  
来看一下效果.

用瑞士军刀发送个UDP消息到192.168.0.108的10000端口.

```
% nc -u 192.168.0.108 10000                                                   ✭
abcd
```

同时开一个Tcpdump监听看看:

```
# tcpdump -vvv -x -nn icmp                                                    ✭
tcpdump: listening on eth0, link-type EN10MB (Ethernet), capture size 65535 bytes
01:48:01.420363 IP (tos 0x0, ttl 64, id 45430, offset 0, flags [DF], proto ICMP (1), length 56)
    192.168.0.108 > 192.168.0.104: ICMP 192.168.0.108 udp port 10000 unreachable, length 36
	IP (tos 0x0, ttl 64, id 42558, offset 0, flags [DF], proto UDP (17), length 33)
    192.168.0.104.60181 > 192.168.0.108.10000: [no cksum] UDP, length 5
	0x0000:  4500 0038 b176 4000 4001 072a c0a8 006c
	0x0010:  c0a8 0068 0303 eac9 0000 0000 4500 0021
	0x0020:  a63e 4000 4011 1269 c0a8 0068 c0a8 006c
	0x0030:  eb15 2710 000d 0000
```


# ping
最重要的PING的实现还没有写. 后面补上.
