---
layout: post
title:  "在vim中输入特定范围的IP地址"
date:   2015-03-24 18:50:02 +0800
modifydate:   2015-03-24 18:50:02 +0800
abstract:   "在ansible的hosts中需要输入从192.168.0.100到192.168.1.150
"
categories: vim
---

在ansible的hosts中需要输入从192.168.0.100到192.168.1.150, 对bash不熟悉, 之前结合python是可以做到的. 刚刚还是搜索了一下bash的方法,记录一下.

bash的:

```
:r !for i in {100..150}; do echo 192.168.1.$i ; done
```

r就是read的缩写,将后面的内容读入到当前文档.  
如果read filename , 就是把filename里面的内容读入当前文档.


!代表后面是bash命令, 加起来就是把后面的bash的输出读入当前文档.

主要是为了纪录一下bash里面对for的这种应用.

python版本的,注意转义

```
:r !python -c "for i in range(100,151):print '192.168.1.\%d'\%i"
```

learn from [http://tldp.org/LDP/abs/html/bashver3.html](http://tldp.org/LDP/abs/html/bashver3.html)
