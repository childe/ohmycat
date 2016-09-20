---

layout: post
title:  "elasticsearch中的common terms query"
date:   2016-09-20 12:28:20 +0800
categories: elasticsearch

---

翻译自[https://www.elastic.co/guide/en/elasticsearch/reference/2.3/query-dsl-common-terms-query.html](https://www.elastic.co/guide/en/elasticsearch/reference/2.3/query-dsl-common-terms-query.html)

**common** terms query 是stopword一个替代方案(但我感觉比单纯的stopword好多了). 它可以提升精确度, 还不会牺牲性能.

## The Problem

在Query中, 每个Term都消耗一定的资源. 
搜索"The brown fox"需要三次term query,
这三个term都会在索引中的所有文档中执行,但是 "The" 这个term对相关性的影响比其他两个term要小.

之前的解决方法是把"the"这种高频词当成stopword, 可以减少索引大小, 在搜索的时候也会减少query次数.

但是, 虽然高频词对相关性的影响小, 但是他们依然很重要. 
如果把stopword去掉, 会丧失精确性, 比如说"happy", "not happy"就区分不了了.
而且, "The The" , "To be or not to be" 这种文本就丢失了.


## 解决方案

**common** terms query把query temrs分成2组, 一组是更重要的(低频词), 一组是不太重要的(高频词,之前被当成stopword).

第一步, 先搜索更重要的term, 它们是低频词, 对相关性的影响更大.

第二步, 再对高频词执行第二次搜索. 但是它不对所有匹配的文档打分, 只对第一步中匹配的文档打分.
这样的话, 高频词也可以提升结果的相关性, 同时还不会增加很多负载.

**上面这个第二步没有很理解, 为什么不会增加很多负载. 因为对query的执行原理不清楚 :(**

如果query里面的term全是高频词,那么query会按照 **AND** queyr来执行(默认是or). 
这样的话, 虽然每个term都匹配好多文档, 但AND之后,结果集就会小很多.  
也可以用 minimum_should_match 这个参数控制用 OR query, 最好使用一个大点的值~

### 怎么样才算高频词呢?

cutoff_frequency 来控制, 哪些是高频词, 哪些是低频词.
cutoff_frequency <= 1的时候,代表一个比率, 如果大于1, 代表一个绝对值.
cutoff_frequency 是单个shard级别计算的.

**最有趣**的是, stopword是自动的, 在一个视频网站, "video"这个term可能就自动变成了stopword(其实也就是指高频词)

## 举例

还是来举几个例子吧.

1. 新建一个索引

        POST test/
        {
           "mappings": {
              "logs": {
                 "properties": {
                    "msg": {
                       "type": "string",
                       "index": "not_analyzed"
                    }
                 }
              }
           }
        }

2. 插入数据

    插入1W条文档. 每条文档都是一些随机的单词, 然后再随机加其中一个stopword (stopword包括以下四个 to be or not).  
    就是说, 这四个stopword每个都有大约2500条.


        import string
        alphabet = string.ascii_lowercase
        common_terms = ['to', 'be', 'or', 'not']


        def gen_word():
            word = [random.choice(alphabet) for i in range(random.randint(1, 10))]
            return ''.join(word)


        def gen_sentence():
            words = [gen_word() for i in range(random.randint(1, 10))]
            words.append(random.choice(common_terms))
            random.shuffle(words)
            return ' '.join(words)


        def bulk(eshost, auth, index, size):
            if auth:
                auth = tuple(auth.split(':'))
            else:
                auth = None

            actions = []
            for i in range(size):
                actions.append({'index': {}})
                actions.append({'msg': gen_sentence()})

            url = '{}/{}/logs/_bulk'.format(eshost, index)
            logging.debug(url)
            actions = [json.dumps(a) for a in actions]
            r = requests.post(url, data='\n'.join(actions)+'\n', auth=auth)
            logging.debug(r.text)
            if r.ok:
                logging.info('bulk done')
            else:
                logging.error('failed to bulk')


        def main():
            global logger
            parser = argparse.ArgumentParser()
            parser.add_argument("-l", default="-", help="log file")
            parser.add_argument("--level", default="info")
            parser.add_argument("--eshost")
            parser.add_argument("--auth")
            parser.add_argument("--index")
            parser.add_argument("--count", type=int, default=10000)
            args = parser.parse_args()

            initlog(level=args.level, log=args.l)

            for i in range(args.count/100):
                logging.info('bulk %d/%d' % (1+i, args.count/100))
                bulk(args.eshost, args.auth, args.index, 100)


        if __name__ == '__main__':
            main()

3. 随便搜索2条

    从结果里面, 我们取xszgdnv hwonfhy做后续的测试

        POST test/_search?size=2
        
        返回:
        {
           "took": 15,
           "timed_out": false,
           "_shards": {
              "total": 2,
              "successful": 2,
              "failed": 0
           },
           "hits": {
              "total": 10000,
              "max_score": 1,
              "hits": [
                 {
                    "_index": "test",
                    "_type": "logs",
                    "_id": "AVdFuXVBSdUE2kgUlwQp",
                    "_score": 1,
                    "_source": {
                       "msg": "xszgdnv be"
                    }
                 },
                 {
                    "_index": "test",
                    "_type": "logs",
                    "_id": "AVdFuXVBSdUE2kgUlwQr",
                    "_score": 1,
                    "_source": {
                       "msg": "zwcghjwiws hwonfhy sglhqkv vqmckx daowpd to goztgsn xxpzfuzqgg ite"
                    }
                 }
              ]
           }
        }

4. 正常的match

        POST test/_search
        {
           "query": {
              "match": {
                 "msg": {
                    "query": "xszgdnv hwonfhy to be"
                 }
              }
           }
        }

    返回了4971条数据, 接近5000条, 是因为约5000条数据含有to或者be

5. 设置cutoff_frequency

        POST test/_search
        {
           "query": {
              "match": {
                 "msg": {
                    "query": "xszgdnv hwonfhy to be",
                    "cutoff_frequency": 0.1
                 }
              }
           }
        }

    只返回了两条数据, 就是前面那两条.  
    因为to be出现的频率比较超过了0.1(10%), 所以被当成了stopword, 他们只是对过滤出来的两条文档再做进一步打分.

5. low_freq_operator

    这个参数用来控制, 排除stopword之后, 剩下的term应该是OR还是AND. 相应的, 也还有high_freq_operator

    这个参数默认是 or, 改成and看一下

        POST test/_search
        {
           "query": {
              "common": {
                 "msg": {
                    "query": "xszgdnv hwonfhy to be",
                    "cutoff_frequency": 0.1,
                    "low_freq_operator": "and"
                 }
              }
           }
        }

    不返回任何结果.

6. 所有term都是stopword

    前面说到, 所有term都是stopword时, operator自动变成and.

        POST test/_search
        {
           "query": {
              "common": {
                 "msg": {
                    "query": "to be",
                    "cutoff_frequency": 0.1
                 }
              }
           }
        }

    返回三条结果
