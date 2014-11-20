---
layout: post
title:  rabbitmq 学习记录 -- 基本概念
date:   2014-11-17 01:27:00 +0800
modifydate:   2014-11-17 01:27:00 +0800
abstract:   " 一些基本概念, <br> 以及一些我们做项目需要用到的知识点, 比如数据持久化, ACK, exchange to exchange, delay, TTL"
categories: ops rabbitmq
---

messag queue嘛, 就是生产者往里扔东西, 消费者取走. 但是要涉及到细节,还是有些多的.

#基本概念
其实就是[官网文档](https://www.rabbitmq.com/tutorials/amqp-concepts.html)的搬运工.


## 路由模型
先来看看一条消息的生命线, 生产者把消息发送到exchange, 然后根据exchange的类型和routing key(消息发送时的一个参数), 把这条消息路由到不同的队列中去, 图片中是发到了一个列队, 其实也可以到多个. 然后消费都从队列中把消息取走. 
和kafka有些不同, rabbitmq里面的一个队列里面一条消息被一个消费者拿走之后, 就不可能再被其他人取到了(不考虑ACK的时候). 
![来自官网的图片](https://www.rabbitmq.com/img/tutorials/intro/hello-world-example-routing.png)

## queue
队列, 就是存储消息的容器. 有些属性

- Name
-	Durable (the queue will survive a broker restart)
-	Exclusive (used by only one connection and the queue will be deleted when that connection closes)
-	Auto-delete (queue is deleted when last consumer unsubscribes)
-	Arguments (some brokers use it to implement additional features like message TTL)

使用queue之前, 需要先声明. 生产者和消费者都可以申明声明. 
声明的时候如果队列已经存在了, 也没啥事, 但是如果再次声明的时候, 已经存在的队列参数和当时申明的参数不一样, 是会报错的.

## exchange
生产者不和queue接触, 消息**全部**是通过exchange转到对应的queue的. 每一个队列都和一个或者多个exchange绑定在一起. 声明一个queue的时候, 它已经和default exchange绑定在一起了.

exchange有四种类型, 每种有不同的路由方式~

先看一下exchange的属性吧

- Name
- Durability (exchanges survive broker restart)
- Auto-delete (exchange is deleted when all queues have finished using it)
- Arguments (these are broker-dependent)

说exchange类型之前, 要先知道routing key的概念.
- queue和exchange绑定的时候, 是有一个routing key的, 为了和下面的routing key区别开来, 还是叫做binding key吧.
- 发送一条消息时, 有个参数, 叫routing key
- exchange type, bind key, routing key这三个东西结合在一起, 就决定了这条消息最终被路由到哪个/哪几个queue里面.

1.  direct exchange

    发送到direct的消息, 会找到和routing key一样的binding key的队列, 发过去.
    一般来说, 这种exchange就是为了点对点的发消息, 一个消息就是固定发到一个特定的queue中. 但是一定要用来发到多个queue也是可以的.

```py
#!/usr/bin/env python  
# -*- coding: utf-8 -*-
import pika
import sys

def main():        
    body = ' '.join(sys.argv[1:]) or 'Hello World'
    
    connection = pika.BlockingConnection(pika.ConnectionParameters(host='localhost'))
    channel = connection.channel()
     
    channel.queue_declare(queue='hello1')
    channel.queue_bind(exchange='amq.direct', queue='hello1',routing_key="hello")

    channel.queue_declare(queue='hello2')
    channel.queue_bind(exchange='amq.direct', queue='hello2',routing_key="hello")

    channel.basic_publish(exchange='amq.direct',
                        routing_key='hello',
                        body=body)
    connection.close()

if __name__ == '__main__':
    main()
```
            
2.  fanout

    这种类型的exchange会把消息发到每一个和他绑定的队列, routing/binding key被忽略. 适合用广播(和简单订阅?)

3.  topic

    比较灵活的路由方式, routing key可以用通配符.

    \* (star) can substitute for exactly one word.  
    \# (hash) can substitute for zero or more words.

    直接看图吧

    ![topic exchange](https://www.rabbitmq.com/img/tutorials/python-five.png)

4. headers
    这种路由的方式还是很灵活的.

    如果需要绑定的不是一个特定的字符串, 而多个属性. 比如一条服务器的消息, 有OS, 有CPU核数, 有内存大小, 希望这些全部都匹配成功时,也可以是有一条匹配成功时,发到你的队列中来. 这个时候用headers exchange就比较方便.

    绑定的时候,一个重要的参数是x-match. 如果是all,就是说所有属性匹配成功才发到这个队列. 如果是any,就是任意一个属性匹配成功啦.

    这里也有个python的例子 [Using pika to create headers exchanges with RabbitMQ in python](http://deontologician.tumblr.com/post/19741542377/using-pika-to-create-headers-exchanges-with-rabbitmq-in)

5. default
    官网上把default exchange单独列了出来, 不过在我看来, default exchange就是一个direct exchange.  只是有些特殊的地方:
	1. 创建一个queue的时候, 自动绑定到default exchange. binding key就是队列名字
	2. 一个queue不能和default exchange解除绑定 (这点我不100%确定)


**我只是大概翻译一下官网文档,记录一下. 这里对exchange介绍的更加详细. [Working with RabbitMQ exchanges](http://rubybunny.info/articles/exchanges.html#headers_exchanges) 这里面介绍比较详细.**
