---
layout: post
title:  "lvs DR模式中, 为何一定需要一个virtual IP"
date:   2016-04-19 00:50:48 +0800
keywords: linux lvs net
categories: linux
---

在[利用LVS做redis集群](/ops/net/2014/11/13/lvs-and-redis-cluster.html)中记录了当时用LVS DR模式做redis高可用.  
当时并没有多想, 为什么一定要给LVS一个VIP,而不能用他自己原有的IP.   
今天又一次尝试时, 没有分配新的VIP, 而是用原有IP, 才发现这样是不行的.

如果LVS所在机器IP是192.168.0.100, 两个real server是192.168.0.101/102.  
两个real server上面需要在lo绑定192.168.0.100.  
当LVS(192.168.0.100)做ARP询问192.168.0.101/102网卡地址的时候, 他们返回不到真正的192.168.0.100,因为这个IP地址也在自己的lo环路.  
这就导致了192.168.0.100获取不到real server的MAC地址.


用VIP情况就不一样了. 所有机器都绑定一个VIP 192.168.0.200.
LVS询问ARP的时候, 请求应该是, 谁的IP是192.168.0.101, 请告诉192.168.0.100. 这样就可以顺序拿到real server的MAC地址了.
