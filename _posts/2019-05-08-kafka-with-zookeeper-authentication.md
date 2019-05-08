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
