---

date: 2019-11-27T15:16:55+0800

---

## 参考资料:

- [Git 分支管理规范](https://juejin.im/post/5d82e1f3e51d4561d044cd88)

- [Git分支管理策略 - 阮一峰](http://www.ruanyifeng.com/blog/2012/07/git.html)

- [基于 Git 的分支策略- 蜗牛学院](https://zhuanlan.zhihu.com/p/50063660)


## 背景

1. 公司 APP 每个月迭代一次, 比如说每个月 15 号, 发布一个新版本
2. 当前只有一个分支, 所有代码都合并到这个分支, 比如说都合到 master 分支
3. 公司的发布系统, 发布之后可以看到每个版本使用的 branch/tag/commit hash 等(这个后面会提到)

这样会生产一个问题:

15 号发版之后, 开始开发新功能, 合到 master 上面, 这些代码会到下个月15号发到线上.  
但同时, 有些 HotFix 需要马上发到线上. 如果从 master checkout 一个 hotfix 分支出来改代码, 再合回master. master上面会包括还没有测试过的新功能. 那这个hotfix发布之后可能带来问题.

## 最初讨论后的规划

dev/master

增加relese原因?

保留master原因?


## 改动


## 目前实践
