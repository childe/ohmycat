---
layout: post
title:  "python中的字符串intern机制"
date:   2015-03-03 17:00:19 +0800
modifydate:   2015-03-03 17:00:19 +0800
abstract:   "
python里面, 所有东西都是对象.<br><br>

数字有点不一样, python启动的时候, 已经为M以下的小数字预先分配了内存, 因为python认为这些数字是经常被用到的, 频繁的创建和销毁会浪费资源. M的范围是[-5, 257)<br>
<br>
字符串又有点不一样,字符串不是python启动时就初始化好的, 是代码中a=“a”的时候时候创建的. 但python会把创建的字符串放在一个缓冲池里面. 之后创建相同字符串的时候, 就会直接返回. 所以x =“a”; y =“a” xy是同一个对象, 也就是 x is y. 这就是intern的概念<br>
"
categories: python
---

# intern
python里面, 所有东西都是对象.

```py
a = {"name":"childe"}
b = a
a is b
```
上面的代码是生成了一个对象, a b 两个变量都指向这个对象.

```py
a = {"name":"childe"}
b = {"name":"childe"}
a is not b
```
上面的代码是生成了两个对象, a b 两个变量虽然值一样, 但他们是两个不同的对象, 占两块内存.


对于数字有点不一样, python启动的时候, 已经为M以下的小数字预先分配了内存, 因为python认为这些数字是经常被用到的, 频繁的创建和销毁会浪费资源. M的范围是[-5, 257)

字符串又有点不一样  
字符串不是python启动时就初始化好的, 是代码中a=“a”的时候时候创建的. 但python会把创建的字符串放在一个缓冲池里面. 之后创建相同字符串的时候, 就会直接返回.
所以x =“a”; y =“a” xy是同一个对象, 也就是 x is y  
这就是intern的概念


# 看一下现象
但是对于字符串, 还是遇到了一些”奇怪”的现象.

```py
s1="abcd"
s2="abcd"
print s1 is s2


s1 ="abc"+"d"
s2="ab"+"cd"
print s1 is s2


s1 ="a"*20
s2 ="a"*20
print s1 is s2


s1 ="a"*21
s2 ="a"*21
print s1 is s2


s1 =''.join(["abc","d"])
s2 =''.join(["ab","cd"])
print s1 is s2


s1 =''.join(["a"])
s2 =''.join(["a"])
print s1 is s2
```

运行结果

```
True
True
True
False
False
True
```


# what happened

乍一看, 5段代码, 有时候True 有时候False, 好像很乱, 找不到规律.

## 字节码

python会把脚本翻译成字节码然后再一条条的执行, 我们看一下上面的代码会翻译成什么字节码?就会发现清楚很多了.

```sh
python -m dis phenomena.py
```

第一段给s1 s2赋值的字节码是这样的

```
 4           0 LOAD_CONST               0 ('abcd')
              3 STORE_NAME               0 (s1)

  5           6 LOAD_CONST               0 ('abcd')
              9 STORE_NAME               1 (s2)
```

这个很容易理解, 但实际上第二段第三段代码也是同样的字节码.

也就是说 s1 ="abc"+"d" 和 s1 ="a"*20  这样的代码在编译成字节码的时候已经把右边的值编译出来了.

## 有点不一样

但是第四段代码并不是这样, 来对比一下看

```
 14          46 LOAD_CONST              12 ('aaaaaaaaaaaaaaaaaaaa')
             49 STORE_NAME               0 (s1)

 15          52 LOAD_CONST              13 ('aaaaaaaaaaaaaaaaaaaa')
             55 STORE_NAME               1 (s2)

 19          69 LOAD_CONST               5 ('a')
             72 LOAD_CONST               7 (21)
             75 BINARY_MULTIPLY
             76 STORE_NAME               0 (s1)

 20          79 LOAD_CONST               5 ('a')
             82 LOAD_CONST               7 (21)
             85 BINARY_MULTIPLY
             86 STORE_NAME               1 (s2)
```

## why

记得经常出现的pyc文件吧, 他们实际上就是存储的编译好的字节码.  

"a"*20 这样的代码转成”aaaaaaaaaaaaaaaaaaaa”写到字节码的好处显而易见,加快速度,节省内存.   
但如果代码里面有个 “a”*200000 还编码出来存到pyc, 但pyc就被搞爆掉了, 所以如果字符串长度大于20, 就不会再事先编译好了.

## runtime

第四,五段代码又有些不一样. "".join(list) 其实是调用了str的一个方法了, python没有这么牛逼, 直接把方法的执行结果都在编译节段帮我们算出来了, 这个是在runtime执行的. 所以第四段返回了false

## 长度为1的字符串

第五段代码也是执行了join, 而且在字节码中我们看到和第四段是一样的, 那为什么返回了true呢?

我们来看一下python的代码 [http://svn.python.org/projects/python/trunk/Objects/stringobject.c](http://svn.python.org/projects/python/trunk/Objects/stringobject.c)

join生成新的字符串的时候调用了PyString_FromString函数(我看名字猜的TT..), 里面有段代码如下:

```c
if (size == 0) {
        PyObject *t = (PyObject *)op;
        PyString_InternInPlace(&t);
        op = (PyStringObject *)t;
        nullstring = op;
        Py_INCREF(op);
    } else if (size == 1 && str != NULL) {
        PyObject *t = (PyObject *)op;
        PyString_InternInPlace(&t);
        op = (PyStringObject *)t;
        characters[*str & UCHAR_MAX] = op;
        Py_INCREF(op);
    }
```

长度为1的字符串在生成之后会调用PyString_InternInPlace, 这个函数里面实现了intern. 就是到一个全局的字典里面找字符串是不是存在了, 如果已经存在了, 就指过去.

# 一点困惑

再看一下第一段代码的字节码

```
  4           0 LOAD_CONST               0 ('abcd')
              3 STORE_NAME               0 (s1)

  5           6 LOAD_CONST               0 ('abcd')
              9 STORE_NAME               1 (s2)
```

困惑这两次定义是不是调用了两次PyString_FromString, 如果是的话, 并没有哪里做intern的逻辑. 现在觉得其实是只调用了一次, 至于字节码如何被编译成二进制并运行的, 为什么是只调用了一次, 以后再深究吧.

一个验证的方法就是自己在PyString_FromString中打印一次计数, 然后编译自己的python跑一下.

# 参考
[Python中的字符串驻留](http://cnn237111.blog.51cto.com/2359144/1615356)  
[The internals of Python string interning](http://guilload.com/python-string-interning/)
