---

title: 按顺序但非"完全精度"查找
layout: post
date:   2017-04-18 10:42:38 +0800
categories: elasticsearch

---

占个坑先吧. 

```
POST city/_search
{
   "query": {
      "span_near": {
         "clauses": [
            {
               "span_term": {
                  "cname": "地"
               }
            },
            {
               "span_term": {
                  "cname": "北"
               }
            }
         ],
         "slop": 10,
         "in_order": true
      }
   }
}
```
