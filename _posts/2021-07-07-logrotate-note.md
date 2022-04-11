---

layout: post
date: 2021-07-07T17:36:00+0800
title: logrotate 笔记一二

---

## 1

logrotate 里面有如下配置：

```
prerotate
   sh -c "[[ ! $1 =~ mongodb.log$ ]]"
endscript
```

运行时有如下报错：

> error: error running non-shared prerotate script for XXX

这个其实不是错误，是说 prerotate 脚本 return code 不是0，也就是说会跳过这个日志文件的处理。

## 2

如果有两个 Pattern 有重合，比如说 `/var/log/*.log`, 和 `/var/log/redis.log` , Logrotate 不会处理两次，前面那个配置生效。后面的配置会被完全忽略掉。这里要小心。

补充说明一下，如果一个文件在两个 pattern 里面都匹配到，第二个配置被完全忽略掉，而不仅仅是这个文件被忽略。

可以使用这个规则来过滤一些日志。 比如说 `/var/log/redis.log` 不想处理，可以加一个 prerotate 过滤掉

```
prerotate
   sh -c "[[ ! $1 =~ mongodb.log$ ]]"
endscript
```

**更新**

这样会有问题的！后面的 `/var/log*.log` 配置项完全失败了。

大概翻看了一下 [logrotate 的代码](https://github.com/logrotate/logrotate/blob/7b65ecda9a22ce1c57207e38163e20a69b95794b/config.c#L1847)，逻辑应该是这样的:

`/var/log/*.log` 称为一个 entry，每一个 entry，要遍历符合的所有日志，然后和前面的所有 entry 的所有日志对比，如果有一样的，就报 `duplicate log entry` 这个错误，并完全忽略这个 entry，也就是说，这个 entry 里面的所有日志都会跳过。

## 我这个需求怎么办？

我有这样一个需求，对 `/var/lib/*.log` 里面的日志做 rotate，但是

1. mongodb.log 不需要做
2. redis.log 不使用copytruncate

想来想去，只能是“半手工”的来实现，如下：

```
/var/lib/*.log {
    copytruncate
    prerotate
       sh -c "[[ $1 =~ redis.log$ ]]" && mv $1 $1-`date +%Y%m%d-%s` && exit 1
       sh -c "[[ ! ($1 =~ mongodb.log$ || $1 =~ redis.log$) ]]"
    endscript
}
```
