---
layout: post
title:  "访问python中的私有变量"
date:   2014-11-14 22.58.01 +0800
modifydate:   2014-11-14 22.58.01 +0800
abstract:   python中没有私有变量, c++中也可以通过指针访问私有变量
categories: python
---
要给实习生培训python, 话说我自己都不怎么会用, 不能误人子弟, 再看看一些python中的概念吧.
 
看到类以及私有变量时, 想到以前看过文章, 说Python里面有私有函数也能被调用, 就顺手搜索了一下, stackoverflow有个问题就是问这个的. [Why are Python's 'private' methods not actually private?][overflowarticle]

[overflowarticle]: http://stackoverflow.com/questions/70528/why-are-pythons-private-methods-not-actually-private


# HOW
类里面用两个下划线__打头的, 就是私有变量/函数 (后面会说到其实不是这样的)

照着写一份python代码跑跑看

```py
#!/usr/bin/env python
# -*- coding: utf-8 -*-


class A(object):

    def __init__(self):
        super(A, self).__init__()
        self.name = "childe"
        self.__age = 28

    def pub_f(self):
        print 'this is a public function'

    def __pri_f(self):
        print 'this is a private function'


def main():
    a = A()
    a.pub_f()
    print a.name
    try:
        a._pri_f()
    except AttributeError as e:
        print e
    try:
        print a.__age
    except AttributeError as e:
        print e

    print dir(a)


if __name__ == '__main__':
    main()
```

运行结果如下:

    this is a public function  
    childe  
    'A' object has no attribute ‘__pri_f'  
    'A' object has no attribute '__age'  
    ['_A__age', '_A__pri_f', '__class__', '__delattr__', '__dict__', '__doc__', '__format__', '__getattribute__', '__hash__', '__init__', '__module__', '__new__', '__reduce__', '__reduce_ex__', '__repr__', '__setattr__', '__sizeof__', '__str__', '__subclasshook__', '__weakref__', 'name', 'pub_f']  

可以看到直接调用私有变量/函数失败了. 
但是dir(a)的时候, 有'_A__age', '_A__pri_f’ 这两个东西, 来调用一下.

```py
#!/usr/bin/env python
# -*- coding: utf-8 -*-

class A(object):

    def __init__(self):
        super(A, self).__init__()
        self.name = "childe"
        self.__age = 28

    def pub_f(self):
        print 'this is a public function'

    def __pri_f(self):
        print 'this is a private function'


def main():
    a = A()
    try:
        a._A__pri_f()
    except AttributeError as e:
        print e
    try:
        print a._A__age
    except AttributeError as e:
        print e


if __name__ == '__main__':
    main()
```

跑一下, 正常输出了.

> this is a private function  
> 28

  
# WHY 
以上还都是PO主的问题以及他的代码, 他问的也不是how, 而是why. 下面那个回答才让我开了眼界(好吧, 是我太无知了).  这次真的是真的copy代码:

```py
class Foo(object):

    def __init__(self):
        self.__baz = 42

    def foo(self):
        print self.__baz


class Bar(Foo):

    def __init__(self):
        super(Bar, self).__init__()
        self.__baz = 21

    def bar(self):
        print self.__baz

x = Bar()
x.foo()
x.bar()
print x.__dict__
```

运行结果:

> 42  
> 21  
> {'_Bar__baz': 21, '_Foo__baz': 42}  

也就是说, 子类的私有变量与父类里面同名的私有变量共存了.. 以前真的不知道还可以这样. 

同时, [Alya] 还回答了这个问题, 

> The name scrambling is used to ensure that subclasses don't accidentally override the private methods and attributes of their superclasses. It's not designed to prevent deliberate access from outside.

为比我E文还差的比我还懒的同学翻译一下, 就是说
私有变量不是为了防止从外部调用, 而是为了避免被子类不小心重写.

鉴于Alya只回答过这一个问题, 所以还是去官网看一下[类的文档](https://docs.python.org/2/tutorial/classes.html#private-variables-and-class-local-references)吧.  

看过之后, 有种被调戏的感觉.
官网明确说了,python中并没有私有变量, 一个下划线打头表明大家把它”当做”私有变量对待吧, “建议”不要从外部直接改.
至少两个下划线打头, 并以最多一个下划线结尾的变量, 比如说__spam会被重命名为_classname__spam

嗯, 讲python的时候, 又可以多说一点儿了.


# C++
C++里面的私有变量应该也是能访问/修改的. 
因为类实例是在栈空间里面的, 类实例里面的变量, 不管是私有还是公有, 都顺序排列在内存中.

```cpp
#include <iostream>

using namespace std;

class Person{
    public:
        Person(){
            this->age = 28;
        }
    private:
        int age;
};


int main(int argc, const char *argv[])
{
    Person p;
    cout << *(int*)(&p) << endl;
    return 0;
}
```

```sh
% ./a.out 
28
```

**不知道怎么调用私有函数, 但我想也是有办法的吧?**
