---

layout: post
date: 2020-02-28T21:57:54+0800

---

elastic search painless script 里面的 contains "不生效", 还好有 Google

参考资料
[https://discuss.elastic.co/t/painless-collection-contains-not-working/178944/2](https://discuss.elastic.co/t/painless-collection-contains-not-working/178944/2)

上面的链接 实在是太慢了, 摘抄一下

Because Elasticsearch treats those numbers as Longs by default, you need to make sure that you pass a Long to the contains method. The following should work:

```
GET testdatatype_unit_tests/_search
{
  "size": 100,
  "query": {
    "script": {
      "script": {
        "source": "doc['IntCollection'].values.contains(1L)",
        "lang": "painless"
      }
    }
  }
}
```
