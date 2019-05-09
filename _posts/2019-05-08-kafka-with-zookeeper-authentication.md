---

title: 搭建Kafka集群时, 对ZooKeeper认证与权限控制
date: 2019-05-08T11:55:52+0800
layout: post

---

## 废话写在最前

1. 公司需要部署一套kafka, 放在公网服务, 所以就查查资料, 尝试部署一套有SSL加密传输的, 而且有认证和权限控制机制的Kafka集群.

2. 我之前对ZK的认证机制不了解, 也几乎不在JAVA生态圈有过经验, 所以对JAAS完全不了解. 对SASL也是首次接触. 因为kafka官方文档写的实在太简单(仅仅是指https://kafka.apache.org/documentation.html#zk_authz_new这一节), 在尝试和翻阅了好多(过时的)资料之后, 终于算是成功部署了. 但依然很多不知其所以然的地方.

3. 对SSL有一定了解, 对Listenr配置也有一定了解了 . 所以打算先看一下Zookeeper的认证权限控制, 这个之前还没有接触过.

## 对ZooKeeper认证与权限控制目的

大的目的很简单, 因为提供对公的服务, 相比公司内部使用来说, 有安全隐患, 需要做一定的安全保护措施, 也就是上面提到的, "有SSL加密传输的, 而且有认证和权限控制机制的Kafka集群".

具体怎么样做到"更安全"这个目的呢?(也就是我们的更精确一些的目的是什么呢?) 引述一下kafka官方文档中一段话.

	The metadata stored in ZooKeeper for the Kafka cluster is world-readable, but can only be modified by the brokers.
	The rationale behind this decision is that the data stored in ZooKeeper is not sensitive, but inappropriate manipulation of that data can cause cluster disruption.
	We also recommend limiting the access to ZooKeeper via network segmentation (only brokers and some admin tools need access to ZooKeeper).

字面意思很明确, ZK 中存的元信息是任何人都可读的, 但是只能被 Kafka Broker 修改, 因为这些信息不是敏感信息, 但随意改动却可能对 Kafka 造成破坏. 另外建议在网络层面隔离 ZK (因为只有 Broker 和一些管理工具才需要访问Zk )

我的理解是, 官方建议网络层面隔离ZK, 但是 ZK 本身也会有这样一种选择: 不能匿名登陆, 只可以让认证用户登陆. 但是实践下来, 并非如此. (此处存疑, 后面需要查阅ZK文档). 实践下来的"结论"比较奇怪: ZK 通过 JAAS 设置了用户(以及密码), Kafka 需要使用配置过的用户连接 ZK 并设置ACL.  但是, 1, 匿名用户依然可以连接 ZK, 也可以创建 Znode, 以及对 Znode 设置权限.  只是对 Broker 已经创建并设置好ACL的 Znode 只有只读权限. 2. Kafka 一定要是 JAAS 中配置用户(以及相对应的密码), 否则就会创建 Znode 失败.  1和2两点似乎是矛盾的.

## 配置步骤

首先感谢 RedHat 的这篇文档 [https://access.redhat.com/documentation/en-us/red_hat_amq/7.2/html/using_amq_streams_on_red_hat_enterprise_linux_rhel/configuring_zookeeper#assembly-configuring-zookeeper-authentication-str](https://access.redhat.com/documentation/en-us/red_hat_amq/7.2/html/using_amq_streams_on_red_hat_enterprise_linux_rhel/configuring_zookeeper#assembly-configuring-zookeeper-authentication-str)

### 配置 ZK 的认证

ZK 的认证配置可以参考(这个文档是说ZK节点之间的认证, 但Kafka到ZK的认证也就多了一步) [https://cwiki.apache.org/confluence/display/ZOOKEEPER/Server-Server+mutual+authentication](https://cwiki.apache.org/confluence/display/ZOOKEEPER/Server-Server+mutual+authentication), 这里有详细的权威的步骤以及说明, 我简单记录一下吧.

我想提前先提一下 JAAS 配置, 因为这里有个还不明白的地方. ZK 以及 Kafka, 他们的 JASS 配置文件的格式都是一样的, 但简单看了一下 JAAS 的文档, 并没有看到针对这种格式的说明, 所以不明白这种格式是标准, 还是只是 ZK/Kafka 自己定义的格式. 另外, 对于里面的参数, 比如 `username=XXX`, 是有一个标准, 还是大家各自实现自己的, 也不清楚. [存疑]

#### zoo.cfg 配置

将下面配置写入 zoo.cfg.  先提一下注意点, 里面的第2行第3行是 Zk 节点之间的认证开关, 并不影响 Kafka 到 ZK 的认证.

```
quorum.auth.enableSasl=true
quorum.auth.learnerRequireSasl=true
quorum.auth.serverRequireSasl=true
quorum.auth.learner.loginContext=QuorumLearner
quorum.auth.server.loginContext=QuorumServer
#quorum.auth.kerberos.servicePrincipal=servicename/_HOST
quorum.cnxn.threads.size=20
```

因为我们没有使用 kerberos, 所以把第6行注释了.

解释一下各行的意思:

#### quorum.auth.enableSasl=true
打开sasl开关, 默认是关的

#### quorum.auth.learnerRequireSasl=true
ZK做为leaner的时候, 会发送认证信息

#### quorum.auth.serverRequireSasl=true
设置为 true 的时候, learner 连接的时候需要发送认证信息, 否则拒绝.

#### quorum.auth.learner.loginContext=QuorumLearner
JAAS 配置里面的 Context 名字.

#### quorum.auth.server.loginContext=QuorumServer
JAAS 配置里面的 Context 名字.

#### quorum.cnxn.threads.size=20
建议设置成 ZK 节点的数量乘2

#### bin/zkEnv.sh 添加 jvm 选项

```
SERVER_JVMFLAGS="-Djava.security.auth.login.config=/path/to/server/jaas/file.conf"
```

具体的路径自己配置一下, 另外最好确认一下 SERVER_JVMFLAGS 是不是被使用了, 因为版本不断迭代, 后面也许会有变化.

#### JAAS 配置

```
Server {
    org.apache.zookeeper.server.auth.DigestLoginModule required
	    user_super="123456"
		user_kafka="123456"
		user_someoneelse="123456";

};

QuorumServer {
       org.apache.zookeeper.server.auth.DigestLoginModule required
       user_zookeeper="123456";
};

QuorumLearner {
       org.apache.zookeeper.server.auth.DigestLoginModule required
       username="zookeeper"
       password="123456";
};
```

QuorumServer 和 QuorumLearner 都是配置的 ZK 节点之间的认证配置, 我们叫他 Server-to-Server authentication , 并不影响 Kafka 的连接认证. Server 是配置的Kafka连接需要的认证信息, 我们叫他 Client-to-Server authentication

按我的理解说一下配置意思, 不一定准确.

QuorumServer 和 QuorumLearner 是指 Context 名字, 默认是这样的, 但可以通过上面提到的配置更改默认名字.

QuorumServer 里面的 user_zookeeper="123456" , 是特定格式, 代表一个密码为123456的用户, 用户名是zookeeper, Learner 连接的时候需要使用这个用户/密码认证.

QuorumLearner 里面的配置是说, 做为 learner 连接的时候, 使用配置的用户名/密码认证.

下面是我还不明白的地方, 现在只能不负责任的说一下. [存疑]

org.apache.zookeeper.server.auth.DigestLoginModule 应该是指的认证方式, 有些文章中说, 和 Kafka 的 JAAS 配置需要一致, 但我测试下来并非如此.  
我自己实践下来, ZK 中一定要使用 org.apache.zookeeper.server.auth.DigestLoginModule, 但Kafka中可以使用 org.apache.zookeeper.server.auth.DigestLoginModule, 也可以使用 org.apache.kafka.common.security.plain.PlainLoginModule

对机制并不明白, 所以也是云里雾里.

**对于 Server Context 配置, RedHat 文章中说, super 用户自动获得管理员权限. 我也不明白为啥**, 在这里可以配置多个用户, Kafka 选一个用就可以了, 一般我们起名叫 kafka.

#### 打开 Client-to-Server authentication

把下面的配置写到 zoo.cfg

```
requireClientAuthScheme=sasl
authProvider.<IdOfBroker1>=org.apache.zookeeper.server.auth.SASLAuthenticationProvider
authProvider.<IdOfBroker2>=org.apache.zookeeper.server.auth.SASLAuthenticationProvider
authProvider.<IdOfBroker3>=org.apache.zookeeper.server.auth.SASLAuthenticationProvider
```

这里的IdOfBroker是指ZK节点的myid. 后面的 org.apache.zookeeper.server.auth.SASLAuthenticationProvider 是指什么还不明白 [存疑]


ZK 的配置就到这里了, 权限控制(ACL)是另外一个话题. 后面再说.

紧接着说一下 , 如何配置 Kafka 使用认证连接 ZK.

### Kafka 需要的配置

#### 打开开关

在 config/server.properties 里面添加下面一行配置 

```
zookeeper.set.acl=true
```

#### JVM选项中配置JAAS配置文件路径信息

在合适的地方, 添加下面这样的配置, 我在 bin/kafka-run-class.sh 添加的

```
KAFKA_OPTS="-Djava.security.auth.login.config=./config/jaas.conf"
```

#### 配置 JAAS

jaas.conf 配置中添加如下内容

```
Client {
    org.apache.kafka.common.security.plain.PlainLoginModule required
	username="kafka"
	password="123456";

};
```

这样起来之后, Kafka 创建和使用的 Znode 都会被设置了ACL, 其他用户只能看, 不能修改.
