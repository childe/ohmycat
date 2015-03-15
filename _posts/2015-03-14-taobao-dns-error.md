---
layout: post
title:  "淘宝dns解析错误导致首页打不开"
date:   2015-03-15 11:07:27 +0800
modifydate:   2015-03-15 11:07:27 +0800
abstract:   "今天打开淘宝首页的时候发现被转到它们的一个错误网页了, 说我访问的页面不存在.<br><br>
看了一下dns解析和tcudupm抓包看了一下, 觉得是他们内部的dns解析配置错误导致的.
"
categories: net
---

今天下午3点左右吧, 打开淘宝首页的时候被转到一个错误页面, 说我访问的页面不存在.

看被转过去的页面域名还是err.taobao.com, 所以应该还是淘宝内部的"正常"的跳转, 不是病毒啊什么的.

开tcpdump抓包看一下.  和淘宝有关的记录如下:

```
192.168.0.110.50874 > 101.226.178.141.80: Flags [.], cksum 0x193e (correct), seq 3469495610:3469497050, ack 3942073739, win 4096, options [nop,nop,TS val 479275520 ecr 780673144], length 1440
    D...U\T&..n...E...i.@.@......ne......P..M:..E......>.....
    ..*... xGET / HTTP/1.1
    Host: www.taobao.com
    Connection: keep-alive
    Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8
    User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.89 Safari/537.36
    Accept-Encoding: gzip, deflate, sdch
    Accept-Language: zh-CN,zh;q=0.8,en;q=0.6

    ...

    101.226.178.141.80 > 192.168.0.110.50874: Flags [P.], cksum 0x4485 (correct), seq 1:450, ack 1590, win 126, options [nop,nop,TS val 780733766 ecr 479275520], length 449
    T&..n.D...U\..E.....@.8...e......n.P....E...Sp...~D......
    F..*.HTTP/1.1 302 Found
    Server: Tengine
    Date: Sat, 14 Mar 2015 07:25:11 GMT
    Content-Type: text/html
    Content-Length: 258
    Connection: keep-alive
    Location: http://err.taobao.com/error1.html

    <!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">
    <html>
    <head><title>302 Found</title></head>
    <body bgcolor="white">
    <h1>302 Found</h1>
    <p>The requested resource resides temporarily under a different URI.</p>
    <hr/>Powered by Tengine</body>
    </html>

```

总的来说就是我淘宝www.taobao.com, 域名被解析到101.226.178.141这个IP,然后我的请求被转到了http://err.taobao.com/error1.html这个页面.

看一下dns:

```
% nslookup www.taobao.com                                             127 ↵ ✭
Server:192.168.0.1
Address:192.168.0.1#53

Non-authori         tative answer:
Name:www.taobao.com
Address: 222.73.134.41
Name:www.ta     obao.com
Address: 101.226.178.151
Name:www.taobao.com
Address: 222.73.    134.51
Name:www.taobao.com
Address: 101.226.178.141    
```

在 /etc/hosts里添加一行
    222.73.134.41 www.taobao.com
指向另外一个IP试一下, 访问正常了.
然后再手工换成101.226.178.141, 还是被转到错误页, 看来101.226.178.141这个IP是有问题.

网上搜索了一下, 101.226.178.141 这个IP是天猫的.
本地看一下:

```
% host www.tmall.com
www.tmall.com is an alias for www.gslb.taobao.com.danuoyi.tbcache.com.
www.gslb.taobao.com.danuoyi.tbcache.com has address 101.226.178.111
www.gslb.taobao.com.danuoyi.tbcache.com has address 101.226.178.141
www.gslb.taobao.com.danuoyi.tbcache.com has address 101.226.178.151
www.gslb.taobao.com.danuoyi.tbcache.com has address 101.226.181.111
www.gslb.taobao.com.danuoyi.tbcache.com has address 222.73.134.41
www.gslb.taobao.com.danuoyi.tbcache.com has address 222.73.134.51
www.gslb.taobao.com.danuoyi.tbcache.com has address 101.226.181.101
www.gslb.taobao.com.danuoyi.tbcache.com has address 101.226.178.101
```

所以说, 可能是淘宝DNS管理人员不小心把www.taobao.com的一条IP不小心转到天猫去了. 然后还被电信等dns服务器缓存了起来. 

更新:
这其实已经是昨天发生事情了. 但现在看到的dns好像还不对,有可能还是电信的缓存?? 这么久?

到http://tool.chinaz.com/dns 查看了一下, 上海电信的www.taobao.com的dns地址已经没有101.226.178.141了

```
上海[电信]
101.226.178.151 [上海市 浙江淘宝网络有      限公司电信节点]
101.226.181.101 [上海市 浙江淘宝网络有限公司电信节点]
101.226.178.141 [上海市 浙江淘宝网络有限公司电信节点]
101.226.181.111 [上海市 浙江淘宝网络有限公司电信节点]
```
