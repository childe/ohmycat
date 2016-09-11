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

普通的TCP编程模型中, 服务端都会在创建socket之后, 调用listen方法.
就可以netstat看到有个LISTEN状态的socket, 它不在下面的9个状态之中,
因为这时候还没有一个"连接".

```py
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM, socket.getprotobyname('tcp'))
s.bind((HOST, PORT))
s.listen(1)
```

**有下面两点需要注意:**

### bind中的PORT
一般来说, 服务器都会指定一个PORT做绑定.
比如WEB服务器可以绑定80,redis绑定6379等.  
但实际上,

1. 绑定在0端口, 系统会帮你找一个可用的端口.
2. HOST为空字符串, 或者是0.0.0.0, 会绑定在所有的interface
3. 甚至可以不做显示的bind, 相当于bind(('0.0.0.0',0))

### listen方法中的传参
服务端收到客户端发来的建立连接的请求(syn),会回复syn并建立连接.  
这个时候,连接还在内核的一个队列中,并没有交给应用层.  
在应用层获取这个连接之后,内核队列中会把它移除.  
listen(1)就是说最多可以在内核的这个列队中保存一个连接.  
如果在队列满了之后,还有新的syn请求发过来,服务器会忽略.

**按TCP/IP协议详解一书说的,不是所有系统的队列最大值都严格就是listen方法的传参. 传统的BSD设置为 X*3/2+1**

在说建立连接的三次握手之后, 再详细举例来说明.

## 建立连接的三次握手

### SYN_SENT

一般来说, 都是客户端发起Syn请求. 对应客户端的connect()方法

```py
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM,socket.getprotobyname('tcp'))
# s.bind(('172.17.0.3', 5602))
s.connect((HOST, PORT))
```

一般客户端不会显示的bind,会让系统选择一个端口(host,port).
但实际上,和服务器端一样, 也可以自己选择如何bind.

**connect**调用就会触发客户端发送一个Syn请求到服务器端.

### SYN_RCVD

服务器端收到客户端的Syn请求之后, 内核自己会触发回复自己的Syn请求,
完成三次握手中的第二步.
服务端的Socket状态变成SYN_RCVD

和其他状态变迁有些不同, 这个是不受程序控制的.

### ESTABLISHED

客户端在收到服务器的Syn并回复ACK,这时候客户端的Socket状态变成ESTABLISHED.  
服务端在收到ACK之后变成ESTABLISHED.

这个时候, 连接还存在于内核的队列中, 并没有交给应用层.  
应用层调用**accept**之后, 内核队列中移除这个Socket交给应用层.

## 实验

### 客户端发送到错误的端口

服务端的内核收到后,会回复一个RST.

1. 服务器开tcpdump

        tcpdump -nn -S tcp

2. 服务器监听在10000端口

        nc -l 10000

3. 客户端尝试连接服务器的10001端口

        nc 172.17.0.2 10001

4. 查看tcpdump输出

        05:41:02.819297 IP 172.17.0.3.48073 > 172.17.0.2.10001: Flags [S], seq 364673378, win 29200, options [mss 1460,sackOK,TS val 5452568 ecr 0,nop,wscale 7], length 0
        05:41:02.819318 IP 172.17.0.2.10001 > 172.17.0.3.48073: Flags [R.], seq 0, ack 364673379, win 0, length 0

**可以看到服务器对于端口不可到达的SYN请求, 直接回复了一个RST, 并且seq是0**

### 服务端不调用accept

服务端在listen之后不accept()的话, established的socket会一直在内核队列中, 不交给应用层.

1. tcpdump

        tcpdump -nn -S tcp

2. 服务端的代码

        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM, socket.getprotobyname('tcp'))
        s.bind(("172.17.0.2", 10000))
        s.listen(0)
        while 1:
            time.sleep(10)

3. 客户端连接

        sockets = []

        def connect(host,port):
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM, socket.getprotobyname('tcp'))
            s.connect((host,port))
            print 'connected'
            sockets.append(s)

        if __name__ == '__main__':
            for i in range(5):
                threading.Thread(target=connect, args=("172.17.0.2",10000)).run()
            while 1:
                time.sleep(1000)

### 每隔10秒accept一次

### 后进先出

### 不发RST

### 客户端不知道


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

不管是服务端还是客户端都可以主动close.  
像没有Keep-alive的HTTP模型中, 一般是服务器主动close. 
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

