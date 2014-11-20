---
layout: post
title:  rabbitmq 学习记录 -- 权限控制
date:   2014-11-19 15:28:15 +0800
modifydate:   2014-11-19 15:28:15 +0800
abstract:   "对一个资源, rabbitmq有三个方面的权限控制, 分别是configure, write, read. 对于一个amqp命令 比如basic_publish, 需要对这三个方面(中的一个或者多个)设置相应的权限. 权限的表现形式就是一个正则表达式, 匹配queue或者是exchange的名字"
categories: ops rabbitmq
---

## 好懂? 不好懂?

看懂之后, 觉得[官网上的文档](https://www.rabbitmq.com/access-control.html)还是写的挺全面的. 但没看懂的时候, 觉得这写的啥啊...看不懂啊..


## 简单说下权限控制的层次

首先, 权限都是针对virtual host设置的. 毕竟virtual host也是个host.. 当一个用户建立连接的时候, 就先要判断这个用户对这个virtual host有没有权限. 没有的话, 连接也建立不了.

在一个virtual host里面, 对一个资源(原文是resource, 我理解大概就是指的amqp command, 比如说basic_consume), rabbitmq有三个方面的权限控制, 分别是configure, write, read. 对于一个amqp command, 需要对这三个方面(中的一个或者多个)设置相应的权限. 权限的表现形式就是一个正则表达式, 匹配queue或者是exchange的名字

preprocess是我们的一个用户, preprocessed rawevent是两个virtual host.   
在下面的命令中, 可以看到一个用户的权限都是针对virtual host来的.  
针对一个 virtual host, 按顺序分别列出了configure, write, read的权限  <D-r>
对于rawevent这个virtual host, 我们的configure权限是^$, write是^$, read是^rawevent$  , 没错, 就是普通的正则表达式.

```sh
# rabbitmqctl list_user_permissions preprocess  
Listing permissions for user "preprocess" ...  
preprocessed    ^$      ^amq\\.default$ ^$  
rawevent        ^$      ^$      ^rawevent$  
...done
```


## 来几个例子

官网文档这个表格里面, 第一列就相当于权限啦, 一共有16个权限可以用.

如果想拥有声明queue的权限, 找到queue.declare这行, 可以看到需要在拥有configure的权限, 权限是一个针对queue的正则表达式.

**反过来说, 如果我们的configure权限是 .* , 就代表我们可以声明任何名字的queue**

**如果我们限制他声明的队列只能以abcd开头, 就给他configure权限是 ^abcd.*$**

如果还想要queue.bind的权限, 同样找到queue.bind这一行. 看到需要read write两个权限, read权限是queue的正则, write是exchange的正则.


比如, 某用户要订阅消息, 我们限制用户不能自己给queue取名字,只能用服务器生成的队列名字, 而且只能绑定在amq.fanout这个exchange.

比对这张表格, 

声明queue需要:  
configure权限应该是^mq\.gen.*$

绑定到amq.fanout需要:  
write是^mq\.gen.*$  
read是 ^amq.fanout$  

basic_consume需要:  
read是^mq\.gen.*$  

结合起来! 就是:(configure write read的顺序)

> ^mq\.gen.*$   ^mq\.gen.*$   ^(amq.fanout)|(mq\.gen.*)$  
