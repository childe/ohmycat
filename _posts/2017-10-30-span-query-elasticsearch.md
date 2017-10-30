---

layout: post
title: 使用span query解决elasticsearch中的一种复杂搜索
date: 2017-10-30 14:36:34 +0800

---

"传说中的陈老师"(什么鬼??)提了一个需求, 是想利用ES来做一种比较复杂的搜索情况, 我自己测试了一下span query, 看起来是可以满足.

<!--more-->

PDF发的, 不知道怎么转文字, 截个图吧.

![搜索需求](/images/elasticsearch-search-request.png)

我只是自己比较感兴趣, 然后也想着能不能赚个红包. 感觉span query可以解决这个问题, 就试了一下. 我自己的测试结果的确可以, 但还不能完全确定, 传说中的陈老师也没个回应, 我自己先记录一下, 给Blog凑个数.

### 写入一条测试数据

这里b m两个字母重复出现, 是为了验证一种情况, 下文有说.

```
POST test/logs?refresh
{
   "text": "a b c d e f g h i j k l m n b m"
}
```

text字段就是text类型, 默认分词器.

### 搜索

先解释一下span\_within的概念, 毕竟我自己也是刚知道..

官方解释: The big and little clauses can be any span type query. Matching spans from little that are enclosed within big are returned.

就是说先匹配little里面的条件, 如果满足, 再判断little中的条件被包含在big里面.

它和span\_containing类似, 但span\_containing是先做big里面的条件查询.


```
POST test/_search
{
   "query": {
      "span_within": {
         "little": {
            "span_near": {
               "clauses": [
                  {
                     "span_term": {
                        "text": "b"
                     }
                  },
                  {
                     "span_term": {
                        "text": "m"
                     }
                  }
               ],
               "in_order": true,
               "slop": 10
            }
         },
         "big": {
            "span_near": {
               "clauses": [
                  {
                     "span_term": {
                        "text": "a"
                     }
                  },
                  {
                     "span_term": {
                        "text": "b"
                     }
                  },
                  {
                     "span_term": {
                        "text": "c"
                     }
                  },
                  {
                     "span_term": {
                        "text": "e"
                     }
                  },
                  {
                     "span_term": {
                        "text": "m"
                     }
                  },
                  {
                     "span_term": {
                        "text": "n"
                     }
                  }
               ],
               "in_order": true,
               "slop": 100
            }
         }
      }
   }
}
```

搜索结果:

```
{
   "took": 91,
   "timed_out": false,
   "_shards": {
      "total": 5,
      "successful": 5,
      "failed": 0
   },
   "hits": {
      "total": 1,
      "max_score": 0.2674228,
      "hits": [
         {
            "_index": "test",
            "_type": "logs",
            "_id": "AV9r2YYMUNFyO7x1bnyW",
            "_score": 0.2674228,
            "_source": {
               "text": "a b c d e f g h i j k l m n b m"
            }
         }
      ]
   }
}
```

期间"传说中的陈老师"提出了一个疑问:

	Little 里面的b和m，和 big里面的很可能不是同一个

官方文档中并没有提到这一点, 看起来这的确是个问题, 但测试结果显示**不是同一个不会返回**

将little里面的slop改成10以下, 就不会有任何返回结果, 这应该能说明little和big里面的b m必须是同一个.

希望这个方案是可以工作的, 坐等红包, 不要被打脸.
