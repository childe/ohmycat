---
layout: post
title:  "利用LVS做redis集群"
date:   2014-11-13 16:35:27 +0800
modifydate:   2014-11-13 18:40:27 +0800
abstract:   "1. 高可用. 每个服务器都跑一个(或者多个)redis-server实例, 一个实例挂了, 或者一个服务器当了, 可以无缝移交到另外的实例/服务器. 数据可能会有丢失,如果以后对数据可靠性有高要求,会配合dump,还有master slave, 现在暂不考虑. <br>
2. 负载均衡. 只考虑高可用的话, 其实可以用keepalived, 一个redis-server/服务器挂了, VIP就转到另外一台, 但backup的那台机器就资源空闲着, 我们公司小, 不能这么浪费.."
categories: ops net
---
# 需求
我们用ES做日志服务,架构是 上游数据来源=>redis=>logstash=>ES

redis目前还是单点, 没有做高可用, 现在数据量越来越多, 如果下游消费不出问题还好, redis里面数据来了就走,但是下游一旦出问题, 分给redis的内存半小时就撑满了. 
看到redis3.0 beta版本已经提供了集群功能, 但是需要client以集群模式接入, 我们这么多上游用户, 不太可能统一要求他们改造. 

公司也有硬件的LB, 同事在E公司的时候就是用的硬件LB. 但接入还要申请, 而且目前redis结构还没确定,变化还比较大, 以后要改来改去,


 公司流程挺麻烦的... 二来想也自己折腾一下~ 就选择了LVS的方案.

# 目标

1. 高可用. 每个服务器都跑一个(或者多个)redis-server实例, 一个实例挂了, 或者一个服务器当了, 可以无缝移交到另外的实例/服务器. 数据可能会有丢失,如果以后对数据可靠性有高要求,会配合dump,还有master slave, 现在暂不考虑
2. 负载均衡. 只考虑高可用的话, 其实可以用keepalived, 一个redis-server/服务器挂了, VIP就转到另外一台, 但backup的那台机器就资源空闲着, 我们公司小, 不能这么浪费..
3. 不需要客户做改造, 不需要他们重启, 让他们感觉不到!.. 让他们改东西..,还是算了, 二来,统计有多少客户都不好统计,怪自己平时不喜欢写文档记录..

# 设计
两个real server, 192.168.81.51, 192.168.81.234
一个VIP 192.168.81.229

每个上面起一个redis-server实例, 6379端口.

VIP在master上, round robin转连接到其中一个服务器. (每个客户过来的数据量大小不同,而且redis基本上都是长连接,不像Http,所以没有做到完全的负载均衡)

以后可以考虑做master slave. 比如在B机器上面跑一个17379的实例做A机器上面6379的slave. 反之亦然.


# 环境

```sh
#uname -a
Linux VMS02564 2.6.18-308.el5 #1 SMP Tue Feb 21 20:06:06 EST 2012 x86_64 x86_64 x86_64 GNU/Linux

#cat /etc/*release
CentOS release 5.8 (Final)
```

# 实现
## 软件准备起来
### 安装lvs内核模块, 这个默认已经安装了

```sh
# modprobe -l|grep -i ipvs
/lib/modules/2.6.18-308.el5/kernel/net/ipv4/ipvs/ip_vs.ko
/lib/modules/2.6.18-308.el5/kernel/net/ipv4/ipvs/ip_vs_dh.ko
/lib/modules/2.6.18-308.el5/kernel/net/ipv4/ipvs/ip_vs_ftp.ko
/lib/modules/2.6.18-308.el5/kernel/net/ipv4/ipvs/ip_vs_lblc.ko
/lib/modules/2.6.18-308.el5/kernel/net/ipv4/ipvs/ip_vs_lblcr.ko
/lib/modules/2.6.18-308.el5/kernel/net/ipv4/ipvs/ip_vs_lc.ko
/lib/modules/2.6.18-308.el5/kernel/net/ipv4/ipvs/ip_vs_nq.ko
/lib/modules/2.6.18-308.el5/kernel/net/ipv4/ipvs/ip_vs_rr.ko
/lib/modules/2.6.18-308.el5/kernel/net/ipv4/ipvs/ip_vs_sed.ko
/lib/modules/2.6.18-308.el5/kernel/net/ipv4/ipvs/ip_vs_sh.ko
/lib/modules/2.6.18-308.el5/kernel/net/ipv4/ipvs/ip_vs_wlc.ko
/lib/modules/2.6.18-308.el5/kernel/net/ipv4/ipvs/ip_vs_wrr.ko
```

### 安装ipvsadm.  
yum就可以安装. 这个其实有没有都行, 是管理lvs用的. 还没有仔细看用法 , 以后会看看

### 安装keepalived. 
现在最新版本是1.2.13, 但源码下下来, 一直少个依赖, 没搞定, 拉倒. 换1.2.8. keepalived有个坑爹的地方, 就是如果配置文件有错,或者干脆就没有配置文件,启动的时候也不会报错. 默认配置文件使用/etc/keepalived/keepalived.conf, 如果安装在其他地方,请考过来.

## 配置起来
  配置起来之前一定要懂得原理,这个原理也是我这次配置学到的最多的东西,也是记下来的最重要的原因.明白了原理遇到困难就可以快速诊断解决,否则只能黑盒子乱猜,猜对了是运气,更是个坑.

### keepalived配置

```ini
vrrp_instance VI_1 {
    state MASTER			#以master启动, 若别的节点优先级高,转成backup
    interface eth0
    virtual_router_id 51  	#node之间的ID要一样
    priority 100				#优先级大的做master
    advert_int 1
    authentication {
        auth_type PASS		#节点间的认证方式
        auth_pass 1111			#节点间一致
    }
    virtual_ipaddress {
        192.168.81.229
    }
}

#虚拟主机配置
virtual_server 192.168.81.229 6379 {  #设置VIP port 
    delay_loop 6            #每个6秒检查一次real_server状态 
    lb_algo rr              #lvs调度算法这里使用加权轮询 有：rr|wrr|lc|wlc|lblc|sh|dh 
    lb_kind DR              #负载均衡转发规则NAT|DR|TUN 
    #persistence_timeout 60 #会话保持时间 
    protocol TCP            #使用协议TCP或者UDP 
 
    real_server 192.168.81.51 6379 { 
        weight 50
        TCP_CHECK {                 #tcp健康检查 
            #connect_timeout 3      #连接超时时间 
            #nb_get_retry 2         #重连次数 
            #delay_before_retry 3   #重连间隔时间 
            connect_port 6379       #健康检查端口 
            } 
    } 
    real_server 192.168.81.234 6379 { 
        weight 50
            TCP_CHECK {             #tcp健康检查 
            connect_port 6379       #健康检查端口 
        } 
    } 
 } 
```

分两部分, 上半部分是建一个vrrp实例(什么是vrrp?). 如果不要下面的虚拟主机配置,就是HA, redis client会连到当前VIP所在的节点. keepalived挂了之后, backup会变成master,VIP换到新的master上面. 但这样不能做Load balance.

> 手工配置虚IP  
配置:  

```sh
ifconfig eth0:1 VIP netmask 255.255.255.0  
```
删除:  

```sh
ifconfig ethos:1 down
```

下半部分, 就是load balance配置了. 我想, keepalived就是按照这个配置去配置了一下lvs. 用ipvsadm可以看到.

```sh
#ipvsadm
IP Virtual Server version 1.2.1 (size=4096)
Prot LocalAddress:Port Scheduler Flags
  -> RemoteAddress:Port           Forward Weight ActiveConn InActConn
TCP  192.168.81.229:6379 rr
  -> 192.168.81.234:6379          Route   1      0          0
  -> VMS02245:6379                Local   1      0          0
```

两个节点上起来keepalived就可以了, 吗?  如果不需要LB, 只做HA,只要上半部分配置,跑起来就好了. 但如果要LB,还需要下面的系统配置.

### 系统配置
在了解系统配置之前,一定要先搞明白lvs的原理. 如果只是急着把它配起来,还是不要继续看了, 否则是个坑.

#### DR转发原理
我是用的lvs里面的DR(direct routing)转发方式.

> 当一个client发送一个WEB请求到VIP，LVS服务器根据VIP选择对应的real-server的Pool，根据算法，在Pool中选择一台Real-server，LVS在hash表中记录该次连接，然后将client的请求包发给选择的Real-server(只修改了包的目的mac地址)，最后选择的Real-server把应答包直接传给client；当client继续发包过来时，LVS根据更才记录的hash表的信息，将属于此次连接的请求直接发到刚才选择的Real-server上；当连接中止或者超时，hash表中的记录将被删除。  
> from [LVS的三种模式区别详解 — Jason Wu's Thoughts and Writings](http://jasonwu.me/2012/09/11/detailed_lvs_difference_between_the_three_models.html)

**我曾经犹豫DR的IP包会到网关吗?还是直接到Realserver了?如果是到网关的,那再转回来便不能确保到realserver?**

> 从概念上说, I P 路 由 选 择 是 简 单 的 , 特 别 对 于 主 机 来 说 。 如 果 目 的 主 机 与 源 主 机 直 接 相 连 ( 如 点 对 点 链 路 ) 或 都 在 一 个 共 享 网 络 上 ( 以 太 网 或 令 牌 环 网 ),那么 I P 数 据 报 就 直 接 送 到 目的主机上。否则,主机把数据报发往一默认的路由器上,由路由器来转发该数据报。大多 数的主机都是采用这种简单机制。

> from TCP/IP 协议详解卷1


由于DR转发只是改了目的MAC地址,目的IP并没有变,还是VIP, 所以如果realserver上面没有配置这个VIP,包会被直接丢弃. 所以,必须在realserver上面也配置一个掩码为32的VIP,如下:

```sh
ifconfig lo:1 VIP netmask 255.255.255.0 up
```
	
但是这样, 带来一个麻烦问题: 有人问谁的IP是192.168.81.229的时候, 这两个网卡都说, 是我是我是我. 那包发给谁呢, 那就看谁的回答`先`到了. 看图:

```sh
# tcpdump -e -nn host 192.168.81.229
tcpdump: verbose output suppressed, use -v or -vv for full protocol decode
listening on eth0, link-type EN10MB (Ethernet), capture size 96 bytes
22:27:50.720431 00:50:56:92:05:b9 > ff:ff:ff:ff:ff:ff, ethertype ARP (0x0806), length 42: arp who-has 192.168.81.229 tell 192.168.81.156
22:27:50.720858 00:50:56:92:4d:6d > 00:50:56:92:05:b9, ethertype ARP (0x0806), length 60: arp reply 192.168.81.229 is-at 00:50:56:92:4d:6d
22:27:50.720881 00:50:56:92:05:b9 > 00:50:56:92:4d:6d, ethertype IPv4 (0x0800), length 98: 192.168.81.156 > 192.168.81.229: ICMP echo request, id 31307, seq 1, length 64
22:27:50.721040 00:50:56:92:36:44 > 00:50:56:92:05:b9, ethertype ARP (0x0806), length 60: arp reply 192.168.81.229 is-at 00:50:56:92:36:44
22:27:50.721130 00:50:56:92:4d:6d > 00:50:56:92:05:b9, ethertype IPv4 (0x0800), length 98: 192.168.81.229 > 192.168.81.156: ICMP echo reply, id 31307, seq 1, length 64
```

在另外一台主机C上Ping 192.168.81.229的时候, 两个节点都说229在这里. C主机选择最先回答的主机发了icmp包. 这太不靠谱了, 我们一定要让我们的包发到真正的主机上.

还好Linux系统有个关于arp请求响应的配置~

```sh
echo "1" >/proc/sys/net/ipv4/conf/lo/arp_ignore
echo "2" >/proc/sys/net/ipv4/conf/lo/arp_announce
echo "1" >/proc/sys/net/ipv4/conf/all/arp_ignore
echo "2" >/proc/sys/net/ipv4/conf/all/arp_announce  
```

关于这个配置及其如下, 具体的解释可以参考[arp_ignore arp_announce解释](linux/2016/04/19/lvs-arp-response.html)

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

> from [Using arp announce/arp ignore to disable ARP - LVSKB](http://kb.linuxvirtualserver.org/wiki/Using_arp_announce/arp_ignore_to_disable_ARP)


#### 配置lo

```sh
ifconfig lo:1 VIP netmask 255.255.255.0 up 
```

#### 配置arp

```sh
echo "1" >/proc/sys/net/ipv4/conf/lo/arp_ignore
echo "2" >/proc/sys/net/ipv4/conf/lo/arp_announce
echo "1" >/proc/sys/net/ipv4/conf/all/arp_ignore
echo "2" >/proc/sys/net/ipv4/conf/all/arp_announce  
```

### 同时只能有一个节点上跑lvs转发
  如果两个上面都跑了相同配置的keepalived, 那么A转到B的数据, B再转给A, A再转给B, B再转给A, 就是不回给你... 所以呢, 同时只能在一个上面跑lvs.
  我本来想, keepalive应该支持这种配置,就是变成master的时候,才激活某些配置(比如说virtual server),但好像是不行. 于是只能用一种比较绕的方式了, 话不多话, 最终配置上图:
  
**master.conf**

```ini
global_defs {
   router_id LVS_DEVEL
}

vrrp_instance VI_1 {
    state BACKUP
    interface eth0
    virtual_router_id 51
    priority 99
    advert_int 1
    authentication {
        auth_type PASS
        auth_pass 1111
    }
    virtual_ipaddress {
        192.168.81.229/24
    }
    notify_master "/etc/keepalived/notify_master.sh"
    notify_backup "/etc/keepalived/notify_backup.sh"
}

virtual_server 192.168.81.229 6379 {
    delay_loop 6
    lb_algo rr
    lb_kind DR
    persistence_timeout 0
    protocol TCP

    real_server 192.168.81.51 6379 {
        weight 1
        TCP_CHECK {
          connect_port    6379
          connect_timeout 3
        }
    }
    real_server 192.168.81.234 6379 {
        weight 1
        TCP_CHECK {
          connect_port    6379
          connect_timeout 3
        }
    }
}
```

**notify_master.sh**

```sh
#!/bin/sh
echo “0” >/proc/sys/net/ipv4/conf/lo/arp_ignore
echo “0” >/proc/sys/net/ipv4/conf/lo/arp_announce
echo “0” >/proc/sys/net/ipv4/conf/all/arp_ignore
echo “0” >/proc/sys/net/ipv4/conf/all/arp_announce  
diff /etc/keepalived/keepalived.conf /etc/keepalived/master.conf
if test "$?" != "0"; then
    cp /etc/keepalived/master.conf /etc/keepalived/keepalived.conf
    killall -HUP keepalived
fi
```

**notify_backup.sh**

```sh
#!/bin/sh
echo "1" >/proc/sys/net/ipv4/conf/lo/arp_ignore
echo "2" >/proc/sys/net/ipv4/conf/lo/arp_announce
echo "1" >/proc/sys/net/ipv4/conf/all/arp_ignore
echo "2" >/proc/sys/net/ipv4/conf/all/arp_announce  
diff /etc/keepalived/keepalived.conf /etc/keepalived/backup.conf
if test "$?" != "0"; then
    cp /etc/keepalived/backup.conf /etc/keepalived/keepalived.conf
    killall -HUP keepalived
fi
```
