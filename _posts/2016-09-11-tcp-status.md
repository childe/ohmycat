---
layout: post
title:  "TCP连接中的状态变迁"
date:   2016-09-11 12:15:08 +0800
categories: net
---

关于TCP的状态变迁, 这张截自TCP/IP协议详解一书的这张图,简单明了.

![TCP的状态变迁图](/images/tcp-connection-status-change.png)

这篇文章总结一下各状态变迁对应的编程语言中对应哪一个方法调用.

## LISTEN

普通的TCP编程模型中, Server都会在创建socket之后, 调用listen方法.
就可以netstat看到有个LISTEN状态的socket, 它不在下面的9个状态之中,
因为这时候还没有一个"连接".

```py
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM, socket.getprotobyname('tcp'))
s.bind((HOST, PORT))
s.listen(1)
```

**有下面两点需要注意:**

### bind中的PORT
一般来说, Server都会指定一个PORT做绑定.
比如WEB服务器可以绑定80,redis绑定6379等.  
但实际上,

1. 绑定在0端口, 系统会帮你找一个可用的端口.
2. HOST为空字符串, 或者是0.0.0.0, 会绑定在所有的interface
3. 甚至可以不做显示的bind, 相当于bind(('0.0.0.0',0))

### listen方法中的传参
Server收到Client发来的建立连接的请求(SYN),会回复syn并建立连接.  
这个时候,连接还在内核的一个队列中,并没有交给应用层.  
在应用层获取这个连接之后,内核队列中会把它移除.  
listen(1)就是说最多可以在内核的这个列队中保存一个连接.  
如果在队列满了之后,还有新的SYN请求发过来,Server会忽略.

Server是完全忽略, RST也不会发.  
没有任何回应的话, Client会继续在1,2,4,8,16秒之后再次发送SYN请求,然后超时.  
如果发RST的话, 可能会导致Client收到RST后马上再次发送.
Server本来就已经来不及处理了, Client更快的发送SYN包会使Server的情况雪上加霜.

**按TCP/IP协议详解一书说的,不是所有系统的队列最大值都严格就是listen方法的传参. 传统的BSD设置为 X*3/2+1**

在说建立连接的三次握手时, 再详细举例来说明.

## 建立连接的三次握手

### SYN_SENT

一般来说, 都是Client发起SYN请求. 对应Client的connect()方法

```py
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM,socket.getprotobyname('tcp'))
# s.bind(('172.17.0.3', 5602))
s.connect((HOST, PORT))
```

一般Client不会显示的bind,会让系统选择一个端口(host,port).
但实际上,和Server一样, 也可以自己选择如何bind.

**connect**调用就会触发Client发送一个SYN请求到Server.

### SYN_RCVD

Server收到Client的SYN请求之后, 内核自己会触发回复自己的Syn请求,
完成三次握手中的第二步.
Server的Socket状态变成SYN_RCVD

和其他状态变迁有些不同, 这个是不受程序控制的.

### ESTABLISHED

Client在收到Server的SYN并回复ACK,这时候Client的Socket状态变成ESTABLISHED.  
Server在收到ACK之后变成ESTABLISHED.

这个时候, 连接还存在于内核的队列中, 并没有交给应用层.  
应用层调用**accept**之后, 内核队列中移除这个Socket交给应用层.

## 实验

### Client发送到错误的端口

Server的内核收到后,会回复一个RST.

1. Server开tcpdump

        tcpdump -nn -S tcp

2. Server监听在10000端口

        nc -l 10000

3. Client尝试连接Server的10001端口

        nc 172.17.0.2 10001

4. 查看tcpdump输出

        05:41:02.819297 IP 172.17.0.3.48073 > 172.17.0.2.10001: Flags [S], seq 364673378, win 29200, options [mss 1460,sackOK,TS val 5452568 ecr 0,nop,wscale 7], length 0
        05:41:02.819318 IP 172.17.0.2.10001 > 172.17.0.3.48073: Flags [R.], seq 0, ack 364673379, win 0, length 0

**可以看到Server对于端口不可到达的SYN请求, 直接回复了一个RST, seq是0**

### Server不调用accept

Server在listen之后不accept()的话, established的socket会一直在内核队列中, 不交给应用层.
队列满了之后, 后续想连过来的client都不会成功.

1. Server的代码(OSX)

        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM, socket.getprotobyname('tcp'))
        s.bind(("192.168.0.110", 10000))
        s.listen(1)
        while 1:
            time.sleep(10)

2. tcpdump (Client Docker)

        tcpdump -nn -S tcp

3. Client查看连接情况

        while true; do date; netstat -nat|grep 10000; echo; sleep 2; done

4. Client连接

        nc 192.168.0.110 10000
        nc 192.168.0.110 10000
        nc 192.168.0.110 10000

5. tcpdump结果

    第一个连接成功建立, 后续的client会一直发SYN请求, 但得不到Server的响应, 一定次数的尝试后放弃.

        04:03:20.093169 IP 172.17.0.2.40581 > 192.168.0.110.10000: Flags [S], seq 2128820365, win 29200, options [mss 1460,sackOK,TS val 365667 ecr 0,nop,wscale 7], length 0
        04:03:20.093700 IP 192.168.0.110.10000 > 172.17.0.2.40581: Flags [S.], seq 499200001, ack 2128820366, win 65535, options [mss 1460], length 0
        04:03:20.093724 IP 172.17.0.2.40581 > 192.168.0.110.10000: Flags [.], ack 499200002, win 29200, length 0
        04:03:21.069464 IP 172.17.0.2.40582 > 192.168.0.110.10000: Flags [S], seq 3175628114, win 29200, options [mss 1460,sackOK,TS val 365765 ecr 0,nop,wscale 7], length 0
        04:03:22.066630 IP 172.17.0.2.40582 > 192.168.0.110.10000: Flags [S], seq 3175628114, win 29200, options [mss 1460,sackOK,TS val 365865 ecr 0,nop,wscale 7], length 0
        04:03:23.702533 IP 172.17.0.2.40583 > 192.168.0.110.10000: Flags [S], seq 4075606405, win 29200, options [mss 1460,sackOK,TS val 366028 ecr 0,nop,wscale 7], length 0
        04:03:24.065745 IP 172.17.0.2.40582 > 192.168.0.110.10000: Flags [S], seq 3175628114, win 29200, options [mss 1460,sackOK,TS val 366065 ecr 0,nop,wscale 7], length 0
        04:03:24.697617 IP 172.17.0.2.40583 > 192.168.0.110.10000: Flags [S], seq 4075606405, win 29200, options [mss 1460,sackOK,TS val 366128 ecr 0,nop,wscale 7], length 0
        04:03:26.697594 IP 172.17.0.2.40583 > 192.168.0.110.10000: Flags [S], seq 4075606405, win 29200, options [mss 1460,sackOK,TS val 366328 ecr 0,nop,wscale 7], length 0
        04:03:28.075803 IP 172.17.0.2.40582 > 192.168.0.110.10000: Flags [S], seq 3175628114, win 29200, options [mss 1460,sackOK,TS val 366466 ecr 0,nop,wscale 7], length 0
        04:03:30.707333 IP 172.17.0.2.40583 > 192.168.0.110.10000: Flags [S], seq 4075606405, win 29200, options [mss 1460,sackOK,TS val 366729 ecr 0,nop,wscale 7], length 0
        04:03:36.096394 IP 172.17.0.2.40582 > 192.168.0.110.10000: Flags [S], seq 3175628114, win 29200, options [mss 1460,sackOK,TS val 367268 ecr 0,nop,wscale 7], length 0
        04:03:38.735720 IP 172.17.0.2.40583 > 192.168.0.110.10000: Flags [S], seq 4075606405, win 29200, options [mss 1460,sackOK,TS val 367532 ecr 0,nop,wscale 7], length 0
        04:03:52.135680 IP 172.17.0.2.40582 > 192.168.0.110.10000: Flags [S], seq 3175628114, win 29200, options [mss 1460,sackOK,TS val 368872 ecr 0,nop,wscale 7], length 0
        04:03:54.775771 IP 172.17.0.2.40583 > 192.168.0.110.10000: Flags [S], seq 4075606405, win 29200, options [mss 1460,sackOK,TS val 369136 ecr 0,nop,wscale 7], length 0
        04:04:24.215641 IP 172.17.0.2.40582 > 192.168.0.110.10000: Flags [S], seq 3175628114, win 29200, options [mss 1460,sackOK,TS val 372080 ecr 0,nop,wscale 7], length 0
        04:04:26.856687 IP 172.17.0.2.40583 > 192.168.0.110.10000: Flags [S], seq 4075606405, win 29200, options [mss 1460,sackOK,TS val 372344 ecr 0,nop,wscale 7], length 0

6. netstat结果

    Client一定时间内维持在下面状态

        tcp        0      1 172.17.0.2:40582        192.168.0.110:10000     SYN_SENT
        tcp        0      1 172.17.0.2:40583        192.168.0.110:10000     SYN_SENT
        tcp        0      0 172.17.0.2:40581        192.168.0.110:10000     ESTABLISHED

    Server则只有ESTABLISHED

        tcp        0      0 192.168.0.110:10000     172.17.0.2:40581        ESTABLISHED

**注意**
上面的测试应该符合TCP/IP协议详解一书中说的, 也是我平时所理解的. 但并不是所有结果都符合这个行为, 具体表现为:

1. OSX上面listen(0)代表队列无限制?

    至少我测下来, 100都没问题.
    在centos/ubuntu上面0都是允许1个连接在内核队列中, 但他们有更奇怪的行为!

2. 最奇怪的是, 在centos和ubuntu做Server的时候.

    正常的情况(或者说我理解的情况)应该是队列满了以后, Client发送的SYN会石沉大海, Server不应该有任何回应,也不会有RST.
    由Client在多次发送SYN请求后自动放弃.

    但在centos和ubuntu上测试的时候, 情况是这样的:
    
    1. 在队列满的情况下, Client发送SYN请求后, Server会立刻回应SYN包, Client自然就加一个ACK.这样在Client看起来, 一个连接就算是正常完成了.
    2. Server也的确收到了ACK, 但好像忽略了一样, 在1,2,4,8,16秒后继续回复SYN.
    3. 在Server继续回复SYN的时候, Server上面看到有很多SYN_RECV状态的连接. 同时在Client上面,这边连接显示已经ESTABLISHED
    4. Server在超时之后, 把连接丢弃. Client依然维持这个连接为ESTABLISHED
    100. 如果Client尝试发送数据, Server会回复RST.

### 每隔10秒accept一次

### 后进先出

### 不发RST

### Client不知道


## 数据的发送

socket.send() 方法会发送数据包.

send方法在数据写入本机socket的缓冲区之后就返回, 而不是等待发送出去, 或者是等待对方ACK.  
所以说, 即使send成功返回了, 也不代码数据发出去了, 更不代表对方已经收到了.

如果send失败, 可能是缓冲区已经满了, 或者是其他错误.  
但是一旦send成功, 在应用层想知道对方是不是已经收到是不太可能了.
如果没有收到ACK,内核会帮忙重试,但应用层感知不到.  
只能通过接下来的recv方法来看对方是否回复了数据,以及数据是否正确等,但和send已经没关系.
但就TCP协议来说, 已经和send没什么关系了.

对方的ACK也是内核自动回复的. 应用层面也并没有什么调用方法对应发送ack这个行为.

在发送数据过程中, 流量的控制, 丢失后的重度, 后面再详细说.

## 结束连接的四次握手

### FIN_WAIT1

socket.close() 方法会让socket发送一个FIN包给对方, 自己变成FIN_WAIT1状态.

不管是Server还是Client都可以主动close.  
像没有Keep-alive的HTTP模型中, 一般是Server主动close. 
像在kafka消费者中, 可能是消费者消费一定条目之后, 主动close.

### CLOSE_WAIT
在收到对方的FIN之后, 发送ACK. 自己变成CLOSE_WAIT状态.
这是内核行为, 并没有对应的应用层的方法.

### FIN_WAIT2
主动close一方收到对方的ACK之后, 变成FIN_WAIT2状态

### LAST_ACK

被动关闭的一方调用close()方法, 会发送FIN包到对方, 自己变成LAST_ACK状态.

被动关闭的一方收到对方的close之后, 可能是马上就发送close, 这个可能就和上一个ACK合并在一起发送了.  
也可以过一段时间再close(ACK还是会在收到FIN包之后马上回复)

### TIME_WAIT

主动关闭一方收到对方的FIN包之后, 发送ACK, 并变成TIME_WAIT状态,并在这个状态停留2MSL时间. 依系统不同, 可能是30S, 或者1m, 2m等.

### CLOSED

