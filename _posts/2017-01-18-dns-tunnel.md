---

layout: post
title:  "DNS隧道"
date:   2017-01-18 17:07:43 +0800
categories: net

---

前一段时间, 回到家发现电信欠费不能上网了, 赶紧充值的同时, 想到DNS隧道.

host www.baidu.com 发现是可以正常返回的. 但当时手头没有现成的DNS隧道工具, 萌发了自己写一个的想法.

原理应该算是比较简单的, 但是在实现的过程中遇到了一些麻烦, 现在还未完成... 

先把这些困难记录一下, 也练练把事情说清楚的能力.

<!--more-->

## 原理

1. 原理

    我假设你了解DNS, 但不知道什么是DNS隧道, 简单说一下. 一般来说, 如果家里宽带欠费了,或者是连的星巴克网络还未登陆, 这时是不能上网的, 这里说的不能上网包括浏览网页, 发送Email, QQ聊天等. 但是有些人发现, 它会弹出一个让你缴费或者是登陆的页面, 还是域名的页面. 就想到DNS是不是还通的. 果然是通的. 就是说, 虽然HTTP TCP都不通的, 但是到53端口的UDP(DNS使用的端口和协议)是和外界通的, 就通过这条跑把数据发出去.

2. 我需要做的分成两部分.

    一个叫做proxy-client, 应该可以说, 就是一个代理服务器, 但一般要跑在本机, 毕竟已经断网了, 跑在别有地方又连不过去.. 负责接收我的http请求, 包装成dns请求发出去, 然后等待假的dns回应, 再解成正确的http响应, 交给浏览器.

    一个叫做proxy-server, 这个需要部署在外网的机器上, 比如阿里云之类. 负责接收DNS请求, 这应该是一个符合规范的DNS请求, 但它里面是包含了http请求. 解析出来HTTP请求发给真正的HTTP服务器(比如百度), 然后再把百度的响应包装一下发送给proxy-client

3. 准备

    你还有要一个自己的域名, 然后你需要一台机器做DNS服务器, 在域名系统(比如Goddy)上面把域名托管到你的机器上. 把proxy-server部署在自己的机器上, 所有包装好的DNS请求会发送到proxy-server, 经它处理拿到真实的http数据, 再返回到proxy-client

## 实现

打算用golang来实现.

### 思路1

golang已经有web框架了 [https://golang.org/doc/articles/wiki/](https://golang.org/doc/articles/wiki/)  直接拿来用, 拿到http包封装好的request, 可以拿到header与request body, 就能还原出来原始的http请求(或者说是原始的TCP包内容), 然后包装到DNS请求发出去.

proxy-server收到DNS请求(包含Http请求数据)后, 组装成完成的请求, 发送给Http server, 拿到数据后再返回给proxy-client.

proxy-client是用的现成的web框架, 收到proxy-server的真实的http response之后, 解析出来Header和response body, 然后设置Header并写body给浏览器.

困难在于: 如果是chunked, 那proxy-client再写给用户的时候, 编码的后的chunked的内容就错了. 如果你不知道chunked如何编码的, 可以先了解一下.

解决方案就是不管是不是chunked, 都修改成不是. 尚未验证, 心虚..

### 思路2

思路1其实会慢一些, 因为proxy-client到proxy-server以及反过来, 都需要等完整的请求或者是响应收到之后, 才能交给下游.

思路2采用流的方式. proxy-client就是开一个tcp listener, 收到之后直接转给proxy-server, server也同样转发, 大家都不等拿到完整的request/respone.

困难在于: 呃, 我之前以为有一个困难, 但是前两天看golang的http库代码, 发现了如下注释, 感觉没困难了.

	// RFC 2616: Must treat
	//	GET /index.html HTTP/1.1
	//	Host: www.google.com
	// and
	//	GET http://www.google.com/index.html HTTP/1.1
	//	Host: doesntmatter
	// the same. In the second case, any Host line is ignored.

待续, 我先去把代码再改改..
