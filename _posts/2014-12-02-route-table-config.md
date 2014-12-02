---
layout: post
title:  "OSX下面的双网卡路由配置"
date:   2014-12-02 23:51:56 +0800
modifydate:   2014-12-02 23:51:56 +0800
abstract:   "公司网络现在已经好多了, 以前的时候挺奇葩的:无线网络可以连外网, 但不能连公办网络, 有线的正好反过来.<br>
想工作的时候吧,就把无线停了,或者把有线的优先级设高. 遇到问题想google一下呢,就要再反过来把有线停了,无线打开."
---

# 曾经的公司网络
公司网络现在已经好多了, 以前的时候挺奇葩的:无线网络可以连外网, 但不能连公办网络, 有线的正好反过来.

想工作的时候吧,就把无线停了,或者把有线的优先级设高. 遇到问题想google一下呢,就要再反过来把有线停了,无线打开.

有同事说osx设置好有线和无线的优先级,不会有这个问题,系统会自己尝试,测试下来不可以.

# 当前配置
这种配置下, 只能走有线到办公网络. 不能通过wifi连外网.
## 无线网卡
```
% ifconfig en0 
en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
	ether 20:c9:d0:88:96:4f 
	inet6 fe80::22c9:d0ff:fe88:963f%en0 prefixlen 64 scopeid 0x5 
	inet 172.16.27.226 netmask 0xfffff800 broadcast 172.16.31.255
	nd6 options=1<PERFORMNUD>
	media: autoselect
	status: active
```
## 有线网卡
```
% ifconfig en2
en2: flags=8963<UP,BROADCAST,SMART,RUNNING,PROMISC,SIMPLEX,MULTICAST> mtu 1500
	options=4<VLAN_MTU>
	ether 00:8a:8d:8a:12:2a 
	inet6 fe80::28a:8dff:fe8a:121a%en2 prefixlen 64 scopeid 0x4 
	inet 172.16.142.76 netmask 0xffffff00 broadcast 172.16.142.255
	nd6 options=1<PERFORMNUD>
	media: autoselect (100baseTX <full-duplex>)
	status: active
```
## 路由表  **osx下面要用netstat查路由表**
```
% netstat -rl -f inet
Routing tables

Internet:
Destination        Gateway            Flags        Refs      Use    Mtu   Netif Expire
default            172.16.142.251     UGSc           31        0   1500     en2
default            172.16.24.1        UGScI           3        0   1500     en0
127                localhost          UCS             0        0  16384     lo0
localhost          localhost          UH              8 17513401  16384     lo0
169.254            link#4             UCS             0        0   1500     en2
172.16.24/21       link#5             UCS             8        0   1500     en0
172.16.24.1        0:1a:e3:5b:f:d7    UHLWIir         4       43   1500     en0   1119
172.16.142.251     0:1a:e3:5b:1c:44   UHLWIir        32       14   1500     en2   1200
```

先看一下系统是怎么找一个IP包应该走哪个路由的:
> IP路由选择主要完成以下这些功能:
1)搜索路由表,寻找能与目的IP地址完全匹配的表目(网络号和主机号都要匹配)。如果
找到,则把报文发送给该表目指定的下一站路由器或直接连接的网络接口(取决于标
志字段的值)。

> 2)搜索路由表,寻找能与目的网络号相匹配的表目。如果找到,则把报文发送给该表目
指定的下一站路由器或直接连接的网络接口(取决于标志字段的值)。目的网络上的所有主机都可以通过这个表目来处置。例如,一个以太网上的所有主机都是通过这种表目进行寻径的。这种搜索网络的匹配方法必须考虑可能的子网掩码。关于这一点我们在下一节中进行讨论。

> 3)搜索路由表,寻找标为“默认(default)”的表目。如果找到,则把报文发送给该表目指定的下一站路由器。

> from TCP/IP 协议卷1  3.3节

可以看到我这里路由默认走的是有线的, 毕竟在上班, 办公环境要优先, 然后是wifi. 但实际上路由表搜索下来, 除了172.16.24, 其他是不会走到wifi的. 就是说wifi其实是废的.

## 添加路由
思路就是:

1. 把wifi设置成优先的default路由

2. 配置内网的网段走有线的网关

3. 除了有线的, 自然就是走wifi default了


走起.

1. 网络偏好设置里面, 把wifi调整为最高优先级

2. 添加路由

```
route add -net 192.168.0.0/16 172.16.142.251
route add -net 10.0.0.0/8 172.16.142.251
```

就这么简单, 搞定!
来Ping 一下

```
% ping -c 1 www.baidu.com  
PING www.a.shifen.com (61.135.169.105): 56 data bytes
64 bytes from 61.135.169.105: icmp_seq=0 ttl=50 time=23.199 ms

--- www.a.shifen.com ping statistics ---
1 packets transmitted, 1 packets received, 0.0% packet loss
round-trip min/avg/max/stddev = 23.199/23.199/23.199/0.000 ms

% ping -c 1 10.8.84.90                                                                          64 ↵
PING 10.8.84.90 (10.8.84.90): 56 data bytes
64 bytes from 10.8.84.90: icmp_seq=0 ttl=58 time=1.286 ms

--- 10.8.84.90 ping statistics ---
1 packets transmitted, 1 packets received, 0.0% packet loss
round-trip min/avg/max/stddev = 1.286/1.286/1.286/0.000 ms
```
赞, 都是通的.

再来一个内网的域名

```
% ping es.XXXcorp.com    
ping: cannot resolve es.XXXcorp.com: Unknown host
```

擦, 解析不了域名!

## 更改DNS
域名解析不了嘛, 肯定是dns的问题. 
手动更改一下/etc/resolv.conf嘛.
看一下有线的dns配置, 找到有线的dns服务器加进去.

再来一次!

```
% ping es.XXXcorp.com    
ping: cannot resolve es.XXXcorp.com: Unknown host
```
还是不行...

清理一下dns再来一次. 不同版本的osx不一样的命令, 咱保险起见, 都来一次.

```sh
dscacheutil -flushcache
killall -HUP mDNSResponder
```

还是不行...

nslookup手工指定server是没问题的.

```
% nslookup
> server 192.168.102.20
Default server: 192.168.102.20
Address: 192.168.102.20#53
> es.XXXcorp.com    
Server:		192.168.102.20
Address:	192.168.102.20#53

Non-authoritative answer:
Name:	es.XXXcorp.com
Address: 10.8.81.10
> 
```

总之, 一翻测试下来, 才发现  
nslookup, host命令是可以的, ping 浏览器都解析不了.


然后又一翻搜索, 原来还要到网络偏好设置里面,去那里改dns才行.   
nslookup和浏览器是去不同地方找配置的.

做如上修改之后, 整个网络都畅通了.
