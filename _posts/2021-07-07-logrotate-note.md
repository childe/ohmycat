---

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

这个其实不是错误，是说 prerotate 脚本 return code 不是0，也就是说会跑过这个日志文件的处理。

## 2

如果有两个 Pattern 有重合，比如说 `/var/log/*.log`, 和 `/var/log/redis.log` , Logrotate 不会处理两次，前面那个配置生效。后面的配置会被忽略掉。这里要小心。

可以使用这个规则来过滤一些日志。 比如说 `/var/log/redis.log` 不想处理，可以加一个 prerotate 过滤掉

```
prerotate
   sh -c "[[ ! $1 =~ mongodb.log$ ]]"
endscript
```
