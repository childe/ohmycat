---

date: 2019-12-24T14:57:32+0800

---


```
fact = lambda f, n: 1 if n == 0 else n*f(f, n-1)
r = lambda f, n: f(f, n)
print(r(fact,5))

def h():
    return lambda n: (lambda f, n: f(f, n))(lambda f, n: 1 if n == 0 else n*f(f, n-1),n)

print(h()(5))

print((lambda n: (lambda f, n: f(f, n))(lambda f, n: 1 if n == 0 else n*f(f, n-1),n))(5))

def fact(f,n):
    return 1 if n==0 else f(n-1)*n

fact(fact,5)

def r(f,n):
    return f(f,n)

f(fact,5)
```
