---

layout: post
title: git rebase移动commit到另外分支
date: 2018-03-14 17:36:21 +0800

---

## 起因

有两个分支, 一个master, 一个topic.

master上面有commit: A C D  
topic上面有commit: A B C D

本来是要在master上面提交2个新的commit: X Y , 但提交之后才发现是在topic上面提交的. 现在想把 X Y 两个commit移动到mater上面.

用`git rebase --onto` 可以实现这个功能, 模拟一下.

## 模拟脚本

用下面这个脚本模拟一下当前的情况

```
git init
date > 1
git add 1
git commit -m'1'
git checkout -b dev
date > 2
git add 2
git commit -m'2'
git checkout master
date > 3
git add 3
git commit -m'3'
git checkout dev
git merge master -m'merge from master into dev'
date > 4
git add 4
git commit -m'4'
date > 5
git add 5
git commit -m'5'
```

## 脚本执行之后的commit情况

```
* 2d2e87a - (HEAD -> dev) 5 (2 seconds ago) <childe>
* afef668 - 4 (2 seconds ago) <childe>
*   472e819 - merge from master into dev (2 seconds ago) <childe>
|\
| * ac945fe - (master) 3 (2 seconds ago) <childe>
* | 1afa191 - 2 (2 seconds ago) <childe>
|/
* 18f563a - 1 (2 seconds ago) <childe>
```

## 移动commit
```
[/private/tmp/1521020400 on dev]
% git checkout -b newbranch
Switched to a new branch 'newbranch'
[/private/tmp/1521020400 on newbranch]
% git rebase --onto master 472e819 newbranch
First, rewinding head to replay your work on top of it...
Applying: 4
Applying: 5
[/private/tmp/1521020400 on newbranch]
% git checkout master
Switched to branch 'master'
[/private/tmp/1521020400 on master]
% git merge newbranch
Updating ac945fe..33c077f
Fast-forward
 4 | 1 +
 5 | 1 +
 2 files changed, 2 insertions(+)
 create mode 100644 4
 create mode 100644 5
[/private/tmp/1521020400 on dev]
% git rebase --onto 472e819  dev
```
