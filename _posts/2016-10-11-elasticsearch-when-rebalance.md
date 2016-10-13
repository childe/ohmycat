---

layout:      post
title:       elasticsearch中rebalance策略分析及参数调整
date:        2016-10-11 13:58:33 +0800
categories:  elasticsearch

---

在做一些维护的时候, 比如删除/关闭索引, ES会触发rabalance, 但有时候觉得它过于敏感了.

分析一些ES的rebalance策略是怎么样的, 有些不确定, 属于猜测.

举例现在web-2016.10.03正在weak节点上做rebalance:

    web-2016.10.03 4 p RELOCATING 450308191 757.5gb 10.0.0.1 10.0.0.1-> 10.0.0.2 0zDpSrgmT1mSrtEywH86zg 10.0.0.2

源10.0.0.1上面有52个shard, 目的10.0.0.2有48个shard.
总的shard 是33400, web-2016.10.03一共10shards, 无复制片, 共129个Node.

先按公式计算每个Node的weight (这个公式我不是很确定, 之前见到过, 但找不到了, 一部分凭印象, 部分参考代码https://github.com/elastic/elasticsearch/blob/2.4/core/src/main/java/org/elasticsearch/cluster/routing/allocation/allocator/BalancedShardsAllocator.java, 还有一部分算是蒙的吧)

计算中需要三个参数, 见[https://www.elastic.co/guide/en/elasticsearch/reference/current/shards-allocation.html#_shard_balancing_heuristics](https://www.elastic.co/guide/en/elasticsearch/reference/current/shards-allocation.html#_shard_balancing_heuristics)

1的权重是 0.45*(52-33400/129)+0.55*(1-10/129)  
2的权重是 0.45*(48-33400/129)+0.55*(0-10/129)

两个权重的差值是 0.45*(52-48) - 0.55*(1-0) = 2.34, 大于1.

第二个部分先认为是固定不变的(源不大可能大于1,毕竟总shard是10个, 加上复制片才20, 总节点远超过这个. 目标也一般是0)
所以主要影响因素就是0.45*(52-48), 如果想控制, 相差<=3的时候不做迁移, 阈值设置成2就可以.
