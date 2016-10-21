---

title: "稀疏字段对索引大小和内存占用的影响"
date: 2016-10-21 16:23:50 +0800
layout: "post"

---

同一个索引中, 有来自不同用户的数据, 同样的字段, 有些用户定义成了code, 另外的用户定义成了Code. 还有一些字段定义了之后被废弃了再也没用过. 想了解一下索引的大小和内存消耗方面会有多少不同.

先说一下我测试下来的结论吧: (测试不严谨, 参考请谨慎)

1. code被定义成了code/Code两种, 相比都写code这一个字段, 索引的大小和内存占用都有上升, 在我看来, 增加的还不少!  见测试三

2. 如果一个字段比较稀疏, 比如说10000条数据, 只有3000条包括这个字段. 它当然会占用一定的大小和内存, 但小于10000条数据全部有值的情况.  见测试二

3. 如果是定义了一个字段没有用, 并不会影响索引的大小和内存.  见测试二

4. 如果两个用户共用一个索引, 但使用各自的字段. 相比拆成2个索引, 索引的大小更大, 但占用内存较小.

99. 所以说, 同一个索引中, 最应该尽量避免的情况是, 本来同样的字段, 有些用code, 有些用Code, 这种情况.

## 测试1, 呃, 我也不知道在测些啥.. 
只有一个字段a, integer类型. 第一次插入10000条数据, 每次都给a一个随机值, 第二次插入10000条数据, 但会有3000条的a是null

### 第一次

    index         shard prirep ip         segment generation docs.count docs.deleted  size size.memory committed searchable version compound     
    testdocvalues 0     p      10.2.7.110 _0               0      10000            0 274kb        4332 false     true       5.5.0   true     


### 第二次

    index         shard prirep ip         segment generation docs.count docs.deleted    size size.memory committed searchable version compound     
    testdocvalues 0     p      10.2.7.110 _0               0      10000            0 308.8kb        4740 false     true       5.5.0   true     


## 测试2

10个字段, a1-a10, integer类型. 第一次插入10000条数据, 只包括a1-a9. 第二次插入10000条数据, 其中只有3000条包括a10, 第三次插入10000条数据, 全部包括a1-a10. 第四次a10全部88, 不用随机值. 第五次a10全为null

为了测试这3000条sparse数据会增加多少空间, sparse数据的压缩如何.

### 第一次
    index         shard prirep ip         segment generation docs.count docs.deleted  size size.memory committed searchable version compound     
    testdocvalues 0     p      10.2.7.110 _0               0      10000            0 1.8mb       17245 false     true       5.5.0   true     


### 第二次
    index         shard prirep ip         segment generation docs.count docs.deleted  size size.memory committed searchable version compound   
    testdocvalues 0     p      10.2.7.110 _0               0      10000            0 1.9mb       17930 false     true       5.5.0   true     


### 第三次
    index         shard prirep ip         segment generation docs.count docs.deleted size size.memory committed searchable version compound   
    testdocvalues 0     p      10.2.7.110 _0               0      10000            0  2mb       18744 false     true       5.5.0   true     

### 第四次
    index         shard prirep ip         segment generation docs.count docs.deleted  size size.memory committed searchable version compound   
    testdocvalues 0     p      10.2.7.110 _0               0      10000            0 1.8mb       17263 false     true       5.5.0   true     

### 第五次
    index         shard prirep ip         segment generation docs.count docs.deleted  size size.memory committed searchable version compound   

    testdocvalues 0     p      10.2.7.110 _0               0      10000            0 1.8mb       17213 false     true       5.5.0   true     



## 测试3
第一次插入10000条数据, 只有一个字段code, 随机值. 第二次10000条数据, 两个字段, code和Code, 5000条只有code, 另外5000条只有Code. 第三次只有一个字段code, 插入5000条数据.


### 第一次
    index         shard prirep ip         segment generation docs.count docs.deleted    size size.memory committed searchable version compound   
    testdocvalues 0     p      10.2.7.110 _0               0      10000            0 308.5kb        4711 false     true       5.5.0   true     

### 第二次
    index         shard prirep ip         segment generation docs.count docs.deleted    size size.memory committed searchable version compound   
    testdocvalues 0     p      10.2.7.110 _0               0      10000            0 366.1kb        5185 false     true       5.5.0   true     

### 第三次
    index         shard prirep ip         segment generation docs.count docs.deleted    size size.memory committed searchable version compound 
    testdocvalues 0     p      10.2.7.110 _0               0       5000            0 156.7kb        3121 false     true       5.5.0   true     

