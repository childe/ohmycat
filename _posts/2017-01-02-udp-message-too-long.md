---

layout: post
title:  "dns发送消息过长"
date:   2017-01-02 00:36:43 +0800

---

1. 你可能也听过这句话, UDP是基于帧的, TCP是基于流的.
2. IP包是有长度限制的. 超过一定长度, TCP的话, 内核会帮你分成多个包发出去. UDP呢?

我之前只有印象, IPTCP协议详解中, 不记得哪一章了, 有提到, UDP的长度是有最大限制的, 各系统不同, 可能达到不了理论上的IP包最大值. 但我却从没有想到, 如果超过了会怎么样.

因为在尝试实现DNS隧道, 需要确认一下这个问题. 刚才用GO语言试了一下, 如果消息过长, 是会报错的: write udp 127.0.0.1:59933->127.0.0.1:10000: write: message too long
