---

title: vim和python中正则匹配的lookahead模式
date: 2016-11-23 10:27:33 +0800
layout: post

---

## lookahead

之前只知道python中的`lookahead`模式(?=...)怎么写, 今天看到vim的help文档, 看了好一会没看明白. google了一下才清楚了,记录一下.

举例说明一下, 我想匹配这条"狗"是谁的, 只把主人匹配出来, 但猫我不管.

```
In [136]: re.match(r'^my(?= dog)','my dog').group()
Out[136]: 'my'

In [139]: re.match(r'^my(?= dog)','my cat') is None
Out[139]: True
```

也就是说, 我只取了my这个词, 后面的dog没有消费, 但是一定要保证my后面跟的是dog


## positive lookahead

与之对应的还有 `positive lookbehind assertion`, 也举例说明一下.

我想匹配"我的"狗, 而不是别人的, 如下.

```
In [154]: re.search(r'(?<=my )dog','my dog').group()
Out[154]: 'dog'

In [156]: re.search(r'(?<=my )dog','her dog') is None
Out[156]: True
```

注意 这里没有用match, 而是用的search. 因为这两种模式只是"确保"前后有东西, 而不消费任何内容. python里面的match其实是要从头匹配的, dog并非顶头的内容, 所以用match匹配不到.


## VIM

在vim里面也有相应的功能, 但语法有些不一样, 不多说了, 直接举例.

1. 匹配dog, 但必须是我的.

```
/\(my \)\@<=dog
```

2. 匹配主人, 但必须是狗的主人
```
/\w\+\( dog\)\@=
```
