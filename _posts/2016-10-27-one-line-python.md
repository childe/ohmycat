---

layout: post
title: 一行python代码求素数
date: 2016-10-27 23:38:58 +0800

---

看了[如何读懂并写出装逼的函数式代码](http://coolshell.cn/articles/17524.html)就想实验一下, 然后看到朋友圈有人转, <<一行python代码>>, 求拿求素数爽了一把, 写完之后再也不想多看一眼了

先来个只是不用for循环的:

    print filter(lambda n:'' if any(filter(lambda i:n%i==0,range(2,1+int(n**.5)))) else n, range(2,100)) 

然后**增加一点细节**把filter去掉

    print (lambda f:f(f))(lambda f:lambda n: [] if n==1 else f(f)(n-1) + (lambda n:[n] if ((lambda f:f(f))(lambda f: lambda n, i: n if i**2 > n else '' if n % i == 0 else f(f)(n, i+1)))(n,2) else [])(n))(100)
