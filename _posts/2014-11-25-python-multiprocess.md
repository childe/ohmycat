---
layout: post
title:  "python里多线程的写法"
date:   2014-11-25 21:42:28 +0800
modifydate:   2014-11-25 21:42:28 +0800
abstract:   "进程里启用多个线程的时候, 如何等待所有线程结束后再退出主进程? <br>
其实到最后我才知道这都是杞人忧天, Thread()出来的实例本来就是等到主进程结束后才结束.<br>
A boolean value indicating whether this thread is a daemon thread (True) or not (False). This must be set before start() is called, otherwise RuntimeError is raised. Its initial value is inherited from the creating thread; the main thread is not a daemon thread and therefore all threads created in the main thread default to daemon = False."
categories: python
---

今天用到python多线程的时候, 发现不知道如何正确的等待所有线程结束后再结束主线程.

其实到最后我才知道这都是杞人忧天, Thread()出来的实例本来就是等到主进程结束后才结束. 

[官方解释](https://docs.python.org/2/library/threading.html):

> daemon
> A boolean value indicating whether this thread is a daemon thread (True) or not (False). This must be set before start() is called, otherwise RuntimeError is raised. Its initial value is inherited from the creating thread; the main thread is not a daemon thread and therefore all threads created in the main thread default to daemon = False.
> 
> The entire Python program exits when no alive non-daemon threads are left.

默认daemon是false, start之后也不会阻塞在那里(废话, 否则要多线程干嘛, 不过总会想到join会阻塞这点). 对于我的需要来说简直完美,其实什么都不用做嘛.

可以用setDaemon(True)改变daemon值. 这样的话, 就需要调用join等待子线程结束了. (好多此一举..)

# for t in threads: t.join()

可以把所有要起的线程放到一个队列里面, 然后对每一个线程join. 这样的确是可以实现, 但看起来太丑, 用着实在别扭.

像如下这样, 其实for循环里面, 进程等待在第一个join那里:

```py
#!/usr/bin/env python
# -*- coding: utf-8 -*-

from threading import Thread
import time


def target(i):
    time.sleep(10-i)


def main():
    threads = []
    for i in range(10):
        t = Thread(target=target,args=(i,))
        threads.append(t)

    for t in threads:
        t.start()

    for idx,t in enumerate(threads):
        print idx
        t.join()

if __name__ == '__main__':
    main()
```

# multiprocessing.Pool
又用Queue实现了一下, 但还是太丑陋, 封装不好. 然后才搜索到Python其实有个multiprocessing.Pool, 可以很好看的实现这个功能:

```py
#!/usr/bin/env python
# -*- coding: utf-8 -*-

from multiprocessing import Pool
import time

def work():
    print time.time()
    time.sleep(4)

def main():
    pool = Pool(processes=4)
    for i in range(4):
        pool.apply_async(work)

    pool.close()
    pool.join()

if __name__ == '__main__':
    main()
```

# 借鉴官方的Pool, 尝试自己实现一下最简单的Multiprocessing Pool

```py
#!/usr/bin/env python
# -*- coding: utf-8 -*-

from threading import Thread
from Queue import Queue
import time


def hello(msg=None):
    print time.time(),msg
    time.sleep(5)

class MPool(object):
    def posttask(self,func):
        def inner(*args, **kwargs):
            q = args[0]
            real_args = args[1:]
            func(*real_args, **kwargs)
            q.task_done()
        return inner


    def __init__(self):
        self._queue = Queue() #简单起见没有设置队列上限

    def run_task(self, target, *args, **kwargs):
        task = Thread(target=self.posttask(target), args=(self._queue,)+args, kwargs=kwargs)
        self._queue.put(task)
        task.setDaemon(True)
        task.start()

    def join(self):
        self._queue.join()


def main():
    p = MPool()
    for i in range(10):
        p.run_task(hello,i)

    p.join()


if __name__ == '__main__':
    main()
```

**最后再提一下, 我的初衷只是想等所有线程结束后再退出. 默认就是这样的, join什么的都不用.**
