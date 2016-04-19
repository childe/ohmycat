---
layout: post
title:  "arp_ignore arp_announce解释"
date:   2016-04-19 13:18:40 +0800
keywords: linux lvs net arp_ignore arp_announce
categories: linux
---

在[利用LVS做redis集群](/ops/net/2014/11/13/lvs-and-redis-cluster.html)中提到了arp_ignore arp_announce需要修改以配合LVS, 但当时没看明白这两个参数到底什么意思. 今天又找了些文章看, 并测试, 终于明白了一些.

# arp_announce

还是先把英文的解释贴一下:

> arp_announce - INTEGER

> Define different restriction levels for announcing the local
source IP address from IP packets in ARP requests sent on
interface:  
0 - (default) Use any local address, configured on any interface  
1 - Try to avoid local addresses that are not in the target's
subnet for this interface. This mode is useful when target
hosts reachable via this interface require the source IP
address in ARP requests to be part of their logical network
configured on the receiving interface. When we generate the
request we will check all our subnets that include the
target IP and will preserve the source address if it is from
such subnet. If there is no such subnet we select source
address according to the rules for level 2.  
2 - Always use the best local address for this target.
In this mode we ignore the source address in the IP packet
and try to select local address that we prefer for talks with
the target host. Such local address is selected by looking
for primary IP addresses on all our subnets on the outgoing
interface that include the target IP address. If no suitable
local address is found we select the first local address
we have on the outgoing interface or on all other interfaces,
with the hope we will receive reply for our request and
even sometimes no matter the source IP address we announce.

> The max value from conf/{all,interface}/arp_announce is used.

> Increasing the restriction level gives more chance for
receiving answer from the resolved target while decreasing
the level announces more valid sender's information.


**这个是说, 一台机器在配置多个IP的时候, 发送arp请求报文时, 来源IP到底如何选择?**

比如说我这机器有2个IP, 分别是172.16.4.132, 172.16.4.200. 在询问172.16.4.130 MAC地址的时候, 如何选择source ip呢?  
如果172.16.4.132, 172.16.4.200还分别在2个网卡上呢?

这是一条本机出去的arp request.

    14:14:43.587157 ARP, Request who-has 172.16.4.130 tell 172.16.4.132, length 28

可以看到这里选用了172.16.4.132做为source ip.

这里先宝义2个术语吧, 仅在本篇文章适用.

- source ip:  arp request里面的, 如下面所提
- source address: ip包里面的, ip header里面的src ip address.

arp_announce就是提供了几种策略, 可以让系统更好的选择这个source ip.

## arp_announce: 0
默认是0, 翻译出来就是, 配置在任意网卡上的任意IP地址. 还不是很明白如何选择, **测试的结果选择ip包里面的source address**, 就是说如果接下来的IP包是用172.16.4.132做src ip, 就在arp request里面用172.16.4.132做srouce ip. 172.16.4.200也是一样.

测试如下:  
两台机器,A(172.16.4.132, 172.16.4.200) B(172.16.4.130)

A机器上面配置如下

```
eth0      Link encap:Ethernet  HWaddr 00:0c:29:21:d7:58  
          inet addr:172.16.4.132  Bcast:172.16.4.255  Mask:255.255.255.0
          inet6 addr: fe80::20c:29ff:fe21:d758/64 Scope:Link
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:470177 errors:0 dropped:0 overruns:0 frame:0
          TX packets:1682 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000 
          RX bytes:479526719 (479.5 MB)  TX bytes:169865 (169.8 KB)

eth0:1    Link encap:Ethernet  HWaddr 00:0c:29:21:d7:58  
          inet addr:172.16.4.200  Bcast:172.16.255.255  Mask:255.255.255.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
```

B机器上面配置如下

```
eth0      Link encap:Ethernet  HWaddr 00:0c:29:c5:14:0f  
          inet addr:172.16.4.130  Bcast:172.16.4.255  Mask:255.255.255.0
          inet6 addr: fe80::20c:29ff:fec5:140f/64 Scope:Link
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:471838 errors:0 dropped:0 overruns:0 frame:0
          TX packets:2517 errors:0 dropped:0 overruns:0 carrier:0
          collisions:0 txqueuelen:1000 
          RX bytes:481299703 (481.2 MB)  TX bytes:250538 (250.5 KB)
```

A机器上面, `nc -l 10000` , 然后B机器 `nc 172.16.4.200 10000` 连过来. tcpdump抓包可以看到A机器上面的arp request请求如下:

    14:30:01.142332 ARP, Request who-has 172.16.4.130 tell 172.16.4.200, length 28

如果B机器上面 `nc 172.16.4.132 10000`, A上面的arp request则是

    14:43:41.366599 ARP, Request who-has 172.16.4.130 tell 172.16.4.132, length 28


## arp_announce: 1

设置为1的话, source ip会避免选择不在一个子网的. 生成arp request的时候, 会遍历所有包括target ip的子网,如果source address在这个子网里面, 就会选用它做source ip. 如果没有找到这样的子网, 就应用level 2.

**但我有一点没明白, 怎么判断source address在不在这个子网里面??**

如果172.16.4.200的子网掩码是255.255.255.255, 我们看下测试结果.

### 255.255.255.0

子网掩码先不动, 还是255.255.255.0.  先把arp_announce置为1

    # echo 1 > /proc/sys/net/ipv4/conf/eth0/arp_announce

arp缓存清一下

    # arp -d 172.16.4.130

B机器`nc 172.16.4.200 10000`, 测试结果如下:

    14:54:47.174093 ARP, Request who-has 172.16.4.130 tell 172.16.4.200, length 28

### 255.255.255.255
更改子网掩码为255.255.255.255, 然后再测试. arp request还是一样的.

A机器上面:

```
# arp -d 172.16.4.130
[root@virtual-machine:~]
# ifconfig eth0:1 down
[root@virtual-machine:~]
# ifconfig eth0:1 172.16.4.200 netmask 255.255.255.255
```

B机器`nc 172.16.4.200 10000`, 测试结果如下:

    14:54:47.174093 ARP, Request who-has 172.16.4.130 tell 172.16.4.200, length 28


## arp_announce: 2

在这个级别下, 会忽略source address. 会在包含target ip的子网所在的网卡上寻找primary ip. 如果没有找到,就选择出口网卡(或者其他所有网卡)上面的第一个IP. 不管source address是什么, 而是尽可能的希望能收到arp reqeust的回复.

具体的测试过程就不罗列了, A上面有一个secondary ip 是 172.16.4.200/24, B运行`nc 172.16.4.200 10000`的时候, A的arp request是

    17:39:30.975896 ARP, Request who-has 172.16.4.130 tell 172.16.4.132, length 28

# arp_ignore

> arp_ignore - INTEGER  
	Define different modes for sending replies in response to
	received ARP requests that resolve local target IP addresses:  
	0 - (default): reply for any local target IP address, configured
	on any interface  
	1 - reply only if the target IP address is local address
	configured on the incoming interface  
	2 - reply only if the target IP address is local address
	configured on the incoming interface and both with the
	sender's IP address are part from same subnet on this interface   
	3 - do not reply for local addresses configured with scope host,
	only resolutions for global and link addresses are replied  
	4-7 - reserved  
	8 - do not reply for all local addresses

> The max value from conf/{all,interface}/arp_ignore is used
	when ARP request is received on the {interface}

这个相对来说, 就好理解多了.

如果机器A有两个IP 172.16.4.132,172.16.4.200. 当它收到一个arp request, 询问谁的ip是172.16.4.200时, 可以选择不回应. arp_ignore就是做这个控制的.

## arp_ignore: 0

响应任何IP

## arp_ignore: 1
如果请求的IP不在incoming interface, 不回应. (LVS DR模式里面就可以选择这个)

## arp_ignore: 2
如果请求的IP不在incoming interface, 或者与来源IP不在一个子网, 不回应.

## arp_ignore: 3
**没看懂**

## arp_ignore: 4-7
保留值, 暂没用

## arp_ignore: 8
不回应任何arp请求
