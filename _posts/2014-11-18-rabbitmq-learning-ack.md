---
layout: post
title:  rabbitmq 学习记录 -- ACK和数据持久化
date:   2014-11-18 13:21:01 +0800
modifydate:   2014-11-18 13:21:01 +0800
abstract:   "ACK和数据持久化"
categories: ops rabbitmq
---
为了数据不丢失, 需要在两个层面上做一些配置. 一个是ACK, 一个是数据持久化.

## ACK

如果没有启用的话, 消费者拿走消息的时候, queue就把它删除了.

消费者拿走一条消息之后, 还没有处理完就crash了. 那么这条消息就丢失了. 为了保证消息一定被处理完了才从queue中被删掉, 就要启用Message acknowledgment .

启用之后, queue会在收到ack之后把消息删掉. 

在这里没有timeout的概念, 哪怕这个任务执行很久, 不管多久, 会一直等ack. 或者是tcp链接断了, 才会把消息再给另外一个消费者.

ack默认是开启的, 也可以显示显示地关闭

> channel.basic_consume(callback, queue=queue_name, no_ack=True) 


callbak里面要记得发送ack,否则消息要被一次又一次的处理,然后再次回到队列 ... ...

    def callback(ch, method, properties, body):
        print " [x] Received %r" % (body,)
        time.sleep( body.count('.') )
        print " [x] Done"
        ch.basic_ack(delivery_tag = method.delivery_tag)

来跑几个例子测试一下

生产者:

    #!/usr/bin/env python
    # -*- coding: utf-8 -*-
    import pika
    import sys


    def main():
        body = ' '.join(sys.argv[1:]) or 'Hello World'
        connection = pika.BlockingConnection(
            pika.ConnectionParameters(
                host='localhost'))
        channel = connection.channel()
        channel.queue_declare(queue='hello')
        channel.basic_publish(exchange='',
                              routing_key='hello',
                              body=body,
                              )
        connection.close()

    if __name__ == '__main__':
        main()


消费者:

    #!/usr/bin/env python
    # -*- coding: utf-8 -*-
    import pika
    import time


    def callback(ch, method, properties, body):
        print " [x] Received %r" % (body,)
        time.sleep( body.count('.') )
        time.sleep(10)
        raise SystemExit(1)
        print " [x] Done"
        ch.basic_ack(delivery_tag = method.delivery_tag)


    def main():
        connection = pika.BlockingConnection(
            pika.ConnectionParameters(
                host='localhost'))
        channel = connection.channel()
        channel.queue_declare(queue='hello')
        channel.basic_consume(callback,
                              queue='hello',
                              )
        channel.close()

    if __name__ == '__main__':
        main()

发送一条消息到队列 , 然后消费. 观察一下状态 

> \# rabbitmqctl list_queues name messages_ready messages_unacknowledged
> Listing queues ...
> hello	0	1

等10秒, 再看, 消息没有被消费成功, 再次回到队列中.

> \# rabbitmqctl list_queues name messages_ready messages_unacknowledged
> Listing queues ...
> hello	1	0


## REJECT

可以用ACK告诉rabbitmq任务处理完了, 但是如果没有成功的话, 也可以再把消息塞回队列. 就是Negative Acknowledgement. pika对应的方法是basic_reject

**但可得注意, 不要搞成死循环了**


## 数据持久化
启用ack之后, 消费者死掉不会丢失数据, 但rabbitmq进程死掉的话, 消息就丢掉了. 为保证数据不丢失, 还需要启动数据持久化.
需要在两个层面上做持久化:
1. 队列的持久化
2. 消息的持久化

> channel.queue_declare(queue='hello', durable=True)
  
这样就申明了一个持久化的队列, durable的属性是不会变的, 如果之前hello队列已经申明过且不是持久化的, 这个再次申明会失败.
这个队列不会因为rabbitmq重启而丢失, 接下来还要继续做消息的持久化.

    channel.basic_publish(exchange='',
                         routing_key="task_queue",
                         body=message,
                         properties=pika.BasicProperties(
                            delivery_mode = 2, # make message persistent
                         ))

**Q: 如果在一个非持久化的队列上发送数据时, 指明要持久化, 为发生什么情况?**

A:  可以正常发送, 但重启rabbitmq之后, 队列丢失, 当然消息找不到了.

# delay
占位

# ttl
占位

# exchange to exchange
https://www.rabbitmq.com/e2e.html
占位


#权限控制
https://www.rabbitmq.com/access-control.html
占位
