---
layout: post
title:  rabbitmq 学习记录 -- TTL
date:   2014-11-18 15:43:07 +0800
modifydate:   2014-11-19 16:41:17 +0800
abstract:   "TTL有三个层面, 可以配置在队列本身, 也可以针对队列里面的所有消息, 也可以配置在每一条消息上. <br>  队列过期之后,会自动删除,不管里面是不是还有消息. 消息到了TTL后自动被移除"
categories: ops rabbitmq
---

# queue本身的TTL

**注意, 这里说的是queue本身的TTL. 不是说里面的消息**

声明一个队列的时候, 可以用x-expires指定队列的TTL值. 过期之后, 这个队列就被删掉了.

**不管里面是不是还有消息没有消费**

```py
#!/usr/bin/env python
# -*- coding: utf-8 -*-
'''
the queue exists for only 5 seconds, whether there is messages!
'''
import pika
import sys


def main():
    body = ' '.join(sys.argv[1:]) or 'Hello World'
    connection = pika.BlockingConnection(
        pika.ConnectionParameters(
            host='localhost'))
    channel = connection.channel()
    channel.queue_declare(queue='ttlhello',arguments={"x-expires":5000}) # ttl 5 second
    channel.basic_publish(exchange='',
                          routing_key='ttlhello',
                          body=body,
                          )
    connection.close()

if __name__ == '__main__':
    main()
```

跑一下看看效果

```sh
# python queueTTL.py ;sleep 1; rabbitmqctl list_queues; sleep 6;rabbitmqctl list_queues  
Listing queues ...  
ttlhello	1  
Listing queues ...  
```


# Per-Queue Message TTL

这个也是队列的属性, 而不是消息的. 队列中的所有消息过了TTL就会被删除.

```py
#!/usr/bin/env python
# -*- coding: utf-8 -*-
'''
the messages in the queue exist for only 5 seconds
'''
import pika
import sys


def main():
    body = ' '.join(sys.argv[1:]) or 'Hello World'
    connection = pika.BlockingConnection(
        pika.ConnectionParameters(
            host='localhost'))
    channel = connection.channel()
    channel.queue_declare(queue='ttlmessagehello',arguments={"x-message-ttl":5000}) # ttl 5 second
    channel.basic_publish(exchange='',
                          routing_key='ttlmessagehello',
                          body=body,
                          )
    connection.close()

if __name__ == '__main__':
    main()
```

跑一下看看效果

```sh
# python queueMessageTTL.py; rabbitmqctl list_queues; sleep 6; rabbitmqctl list_queues  
Listing queues ...  
ttlmessagehello	1  
Listing queues ...  
ttlmessagehello	0  
```

#Per-Message TTL

发送消息的时候, 也可以给每条消息一个TTL的属性. 

**messageTTLSend.py**

```py
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
                          properties=pika.BasicProperties(
                              expiration="5000"
                             )

                          )
    connection.close()

if __name__ == '__main__':
    main()
```

跑一下看看效果

```sh
# python messageTTLSend.py; rabbitmqctl list_queues; sleep 6; rabbitmqctl list_queues;  
Listing queues ...  
hello	1  
Listing queues ...  
hello	0  
```


**最后, 如per-message ttl 和 per-queue message ttl不一样, 按小的来.**
