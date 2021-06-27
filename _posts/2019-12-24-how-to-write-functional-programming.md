---

date: 2019-12-24T14:57:32+0800
title: 如何把一个功能在一行代码里面实现

---

## 学习资料

- [函数式编程](https://coolshell.cn/articles/10822.html)
- [如何读懂并写出装逼的函数式代码](https://coolshell.cn/articles/17524.html)

几前年看过酷壳的这两篇文章, 当时以为已经掌握了. 现在又想实践一下的时候, 发现完全不知道怎么写了. 所以温习并记录一下.

<!--more-->


## 步骤(套路)

可以认为, 如何把一个功能在一行代码里面实现, 是有固定的套路的.

我还不能马上理解里面的原因原理, 所以自认为是套路, 其实是我自己太弱.

分下面4个步骤, 看不懂也没关系, 下面有例子具体演示说明

1. 用递归实现此功能
2. 将递归函数做为参数传入调用函数(是我写不清楚, 具体看下面例子)
3. 使用匿名函数替换(是我写不清楚, 具体看下面例子)
4. 高阶函数(是我写不清楚, 具体看下面例子)

## 例子一 求阶乘

### 步骤1 递归实现阶乘

求阶乘用递归还是很自然的, 如下

```python
def fact(n):
    return 1 if n==0 else fact(n-1)*n
print(fact(5))
```

### 步骤2

```python
def fact(fun, n):
    return 1 if n==0 else fun(fun,n-1)*n

print(fact(fact,5))
```

其实很简单, 就是把 fact 这个函数本身传参进去, 这是第三步的基础

### 步骤3

我们先把 fact 写成一个 lambda

```python
fact = lambda fun,n : 1 if n==0 else fun(fun,n-1)*n
```

然后把`fact(fact,5)`里面的 fact 变量直接换成上面这个 ldmbda 就好了, 如下

```python
fact = lambda fun,n : 1 if n==0 else fun(fun,n-1)*n
print((lambda fun,n : 1 if n==0 else fun(fun,n-1)*n)((lambda fun,n : 1 if n==0 else fun(fun,n-1)*n),5))
```

但这样有两个缺点

1. 大段的代码重复
2. 我们本来只是传参一个数字, 但现在还要传参一个匿名函数

这就不太体面了, 需要继续修改下. 这也就是步骤3的意义所在.

我们再定义一个函数 r 如下

```python
def r(f,n):
    return f(f,n)
```

r 函数有个优点: 短. 我们只要把 fact 代入这个短的函数中, 就可以去掉大段的重复代码了. 完成代码如下:

```python
fact = lambda fun,n : 1 if n==0 else fun(fun,n-1)*n
r = lambda f,n: f(f,n)
print(r(fact,5))
```

把变量替换掉, 就变成一行代码了

```python
print((lambda f,n: f(f,n))((lambda fun,n : 1 if n==0 else fun(fun,n-1)*n),5))
```

### 步骤4

但是缺点2还是没有解决掉, 步骤4就是解决这个问题的.

我们引入一个高阶函数 h, 这个函数返回另外一个函数 inner , inner 是一个参数为 int 的函数, 如下

其实就是把上面的代码复制到了 h() 里面

```python
def h():
    def inner(n):
        fact = lambda fun,n : 1 if n==0 else fun(fun,n-1)*n
        r = lambda f,n: f(f,n)
        return r(fact,n)
    return inner

print(h()(5))
```

把变量替换一下

```python
def h():
    return lambda n:(lambda f,n: f(f,n))((lambda fun,n : 1 if n==0 else fun(fun,n-1)*n),n)
print(h()(5))
```

把 h 也替换掉

```python
print((lambda:lambda n:(lambda f,n: f(f,n))((lambda fun,n : 1 if n==0 else fun(fun,n-1)*n),n))()(5))
```

或者也可以写成

```python
print((lambda n:lambda:(lambda f,n: f(f,n))((lambda fun,n : 1 if n==0 else fun(fun,n-1)*n),n))(5)())
```

把 fun 全部换成 f , 能短一点是一点

```python
print((lambda:lambda n:(lambda f,n:f(f,n))((lambda f,n:1 if n==0 else f(f,n-1)*n),n))()(5))
```

## 补充 2020-01-16T12:24:07+0800

觉得第四步可以把最外层的 h() 扒掉.

```python
def h():
    return lambda n:(lambda f,n: f(f,n))((lambda fun,n : 1 if n==0 else fun(fun,n-1)*n),n)
print(h()(5))
```

像上面这段代码, 其实没有必要先返回一个函数然后再调用这个函数. 可以直接调用, 如下

```python
(lambda n:(lambda f,n:f(f,n))((lambda f,n:1 if n==0 else f(f,n-1)*n),n))(5)
```

