---
layout: post
title:  "利用tcpdump和kafka协议定位不合法topic的来源client"
date:   2015-12-24 00:30:12 +0800
abstract:   "
<p>事情是这样滴, 我们在很多linux机器上部署了logstash采集日志, topic_id用的是 test-%{type}, 但非常不幸的是, 有些机器的某些日志, 没有带上type字段.</p>
<p>因为在topic名字里面不能含有%字符, 所以kafka server的日志里面大量报错. Logstash每发一次数据, kafka就会生成下面一大段错误, 严重影响日志的正常使用. </p>
<p>更不幸的是, 错误日志里面并没有客户来源的信息, 根本不知道是哪些机器还有问题.</p>
<p>我想做的, 就是把有问题的client机器找出来.</p>
"
keywords: tcpdump kafka protocol
categories: net kafka
---

# 事情缘由

事情是这样滴,  我们在很多linux机器上部署了logstash采集日志, topic_id用的是 test-%{type}, 但非常不幸的是,  有些机器的某些日志, 没有带上type字段. 
 
因为在topic名字里面不能含有%字符, 所以kafka server的日志里面大量报错. Logstash每发一次数据, kafka就会生成下面一大段错误
 
```
[2015-12-23 23:20:47,749] ERROR [KafkaApi-0] error when handling request Name: TopicMetadataRequest; Version: 0; CorrelationId: 48; ClientId: ; Topics: test-%{type} (kafka.server.KafkaApis)
kafka.common.InvalidTopicException: topic name test-%{type} is illegal, contains a character other than ASCII alphanumerics, '.', '_' and '-'
        at kafka.common.Topic$.validate(Topic.scala:42)
        at kafka.admin.AdminUtils$.createOrUpdateTopicPartitionAssignmentPathInZK(AdminUtils.scala:181)
        at kafka.admin.AdminUtils$.createTopic(AdminUtils.scala:172)
        at kafka.server.KafkaApis$$anonfun$19.apply(KafkaApis.scala:520)
        at kafka.server.KafkaApis$$anonfun$19.apply(KafkaApis.scala:503)
        at scala.collection.TraversableLike$$anonfun$map$1.apply(TraversableLike.scala:244)
        at scala.collection.TraversableLike$$anonfun$map$1.apply(TraversableLike.scala:244)
        at scala.collection.immutable.Set$Set1.foreach(Set.scala:74)
        at scala.collection.TraversableLike$class.map(TraversableLike.scala:244)
        at scala.collection.AbstractSet.scala$collection$SetLike$$super$map(Set.scala:47)
        at scala.collection.SetLike$class.map(SetLike.scala:93)
        at scala.collection.AbstractSet.map(Set.scala:47)
        at kafka.server.KafkaApis.getTopicMetadata(KafkaApis.scala:503)
        at kafka.server.KafkaApis.handleTopicMetadataRequest(KafkaApis.scala:542)
        at kafka.server.KafkaApis.handle(KafkaApis.scala:62)
        at kafka.server.KafkaRequestHandler.run(KafkaRequestHandler.scala:59)
        at java.lang.Thread.run(Thread.java:744)
```

有用的信息瞬间被淹没.  
 
更不幸的是, 错误日志里面并没有客户来源的信息, 根本不知道是哪些机器还有问题.
 
**我想做的, 就是把有问题的logstash机器找出来.**
 
# 先给个解决方案
 
我就先事后诸葛亮一把, 用下面这个命令就可以把配置错误的机器找出来(也可以没有任何结果, 原因后面说)

    tcpdump -nn 'dst port 9092 and tcp[37]==3 and tcp[57]==37'

# 这是什么鬼

dst port 9092就不说了, 这是kafka的默认端口, 后面的tcp[37]==3 and tcp[57]==37是啥意思呢, 我们慢慢说.
 
先要说一下: client要生产数据到kafka, 在发送消息之前, 首先得向kafka"询问"这个topic的metadata信息, 包括有几个partiton, 每个parttion在哪个服务器上面等信息, 拿到这些信息之后, 才能把消息发到正确的kafka服务器上.
 
*重点来了!*   
向kafka"询问"topic的metadata, 其实就是发送一个tcp包过去, 我们需要知道的是这个tcp包的格式. 我已经帮你找到了, 就在这里 [https://cwiki.apache.org/confluence/display/KAFKA/A+Guide+To+The+Kafka+Protocol#AGuideToTheKafkaProtocol-TopicMetadataRequest](https://cwiki.apache.org/confluence/display/KAFKA/A+Guide+To+The+Kafka+Protocol#AGuideToTheKafkaProtocol-TopicMetadataRequest)
 
看完文档之后(半小时或者更长时间过去了), 你就会知道, tcp body(除去tcp head)里面的第6个字节是03, 代表这是一个TopicMetadataRequest请求.  topicname里面的%字符出现在tcp body的第26个字节, %的ascii码是37
 
tcp头一般是20个字符, 所以加上这20个字节, 然后下标从0算起, 就是tcp[20+5]==3 and tcp[20+25]==37, 也就是tcp[25]==3 and tcp[45]==37.
 
咦, 为啥和开始写的那个过滤条件不一样呢, 因为tcp头"一般"是20字节, 但是如果其中还包含了tcp选项的话, 就可能比20多了. 反正我这里看到的的tcp头都是32个字节, 所以不能加20, 要加32, 也就是最开始写的 tcp[37]==3 and tcp[57]==37 

# 最后再提2点结束
 
1. 终极大杀器, 不过tcp头的长度是多少, 20也好, 32也好, 或者其他也好, 下面这样都能搞定

        tcpdump -nn 'dst port 9092 and tcp[(tcp[12]>>2)+5]==3 and tcp[(tcp[12]>>2)+25]==37'

2.  不要一上来就这么高端, 其实我最开始是这样先确定问题的

        tcpdump -vv -nn -X -s 0 dst port 9092 | grep -C 5 "test-"

你问我为啥不把test-t{type}写完整? 不是为了省事, 其实是因为很不幸, test-%{t 到这里的时候, 正好换行了.
