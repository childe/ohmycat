---

date: 2019-11-27T15:16:55+0800

---

## 背景

1. 公司 APP 每个月迭代一次, 比如说每个月 15 号, 发布一个新版本
2. 当前只有一个分支, 所有代码都合并到这个分支, 比如说都合到 master 分支
3. 公司的发布系统, 发布之后可以看到每个版本使用的 branch/tag/commit hash 等(这个后面会提到)

这样会生产一个问题:

15 号发版之后, 开始开发新功能, 合到 master 上面, 这些代码会到下个月15号发到线上.  
但同时, HotFix 需要马上发到线上. 如果从 master checkout 一个 hotfix 分支出来改代码, 再合回master. master上面会包括还没有测试过的新功能. 那这个hotfix发布之后可能带来问题.

## 最初讨论后的规划

### 如何在现有的基础(单分支)上解决这个问题

中间有同学提出目前这样也可以解决上面的问题: 功能开发正常推到 master , 如果有 hotfix, 到发布系统看一下当前的 Commit 或者是 Tag, 拉一个新的分支, fix 之后推上去继续发布.

但会有一些问题:

- 每次要做 hotfix, 还要去发布系统查看当前的 tag 或者是 commit
- 如果两个人同时做 hotfix, *可能*后面发布的人同学会把前面那个人的覆盖掉
- 分支混乱, 每次 hotfix 后推一个新的分支上来?

## 会后讨论结果(实践后又有变化):

决定使用dev 和 master 两个分支

1. 日常开发推 dev, 15号之后合到 master , 打上 tag
2. 15号之后的 hotfix , 从 master 拉分支出来, fix之后合回master, 同时 cherry-pick 到 dev
3. 细节上可能会有问题, 再实践中慢慢摸索


## 改动

### 增加relese 分支

代码在真正发布到生产之后, 需要先发布到测试环境测试.  
使用 dev 发布并没有问题, 但如果结合持续集成(CI), 就有些问题了.

我希望的是, 每次 Merge 之后, 会自动发布, 而不需要我每次到发布系统点点点.  
显然不能把 Dev 分支配置成自动发布, 否则在新的开发周期, 会频繁做一些无用的发布.

所以需要 release 分支. 发布的时候, 直接从 dev checkout 一份最新代码, 推到远端 release, 自动发布.

15 号发布之后, 就把当前 release 代码合到 master, 并打上 tag

### 保留 master

如果只是为了回滚, tag 足够了. master 是为了方便的 hotfix. 想像一下没有 master, 每次发布还要查看最新的 tag 是什么, 万一再忘了打 tag 呢?

## 目前实践

总结一下, 实践下来, 保留 2 个主要分支, dev 和 master, 一直存在, 不能删除. 一个临时分支 release.

以一次新的迭代周期开始为例:

1. 新的功能开发推到 dev. hotfix 推到 master, 并更新版本号, 并 cherry-pick 到 dev.
2. 10 号了, 开始预发布了(一般是先到测试环境), 每次发布就把 dev 的代码合到 release, 推到远端(我一般在命令行操作), CI 会自动做发布.
3. 15 号, 发布到生产. release 代码合到 master, 并打一个 tag. (可以由项目 Owner 或者管理员 手工操作)
4. 15 号之后, 回到步骤1

## 2020-03-30 补充

有人提到使用 release 发布太麻烦了, 应该 dev 也能发布. 现成改成了 dev 也会发布. 运行良好.

## 参考资料:

- [Git 分支管理规范](https://juejin.im/post/5d82e1f3e51d4561d044cd88)
- [Git 分支管理策略 - 阮一峰](http://www.ruanyifeng.com/blog/2012/07/git.html)
- [基于 Git 的分支策略- 蜗牛学院](https://zhuanlan.zhihu.com/p/50063660)
- [语义化版本](https://semver.org/lang/zh-CN/)
