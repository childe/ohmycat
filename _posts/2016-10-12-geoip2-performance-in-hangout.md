---

layout: post
title: hangout中GeoIP2的性能统计
date: 2016-10-12 12:05:12 +0800
categories: elaticsearch

---

在[hangout](https://github.com/childe/hangout)里面, 有个GeoIP2插件, 可以根据IP添加地理信息.
我们在使用这个插件之后, 发现处理速度有些下降, 于是通过日志统计了一下这个插件的性能.

我们是跑在marathon + docker平台上的, 可能统计会有所偏差.

每批60000条数据, 处理好之后, bulk到ES. 日志会记录bulk的时间, 和bulk结束拿到response的时间, 根据这两个时间统计.


    使用GeoIP2之前的
    filter:  234055次 平均8.51832039051秒 (不包括GeoIP2, 但有其他的Filter)
    bulk:  234048次 平均 5.99807413009秒

    之后的
    filter: 9145次 平均 13.0438958994秒 (在之前Filter的基础上, 添加了GeoIP2)
    bulk:  9146次 平均 3.70712070851秒

后面bulk快可能是因为ES做过扩容.  
但是filter时间多了4.5秒, 每批6W条数据, 平均一条数据0.000075秒.
