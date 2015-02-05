---
layout: post
title:  "红绿灯"
date:   2015-01-30 12:07:55 +0800
abstract:   "有天冲到十字路口, 可是刚刚变成红灯,等了20秒. 接下来还有十几个路口, 就想这次红灯等了20秒, 会不会一连串的红灯把这20秒放大了, 导致到最后耽误了几分钟.有点像蝴蝶效应"
categories: game
---

有天冲到十字路口, 可是刚刚变成红灯,等了20秒. 接下来还有十几个路口, 就想这次红灯等了20秒, 会不会一连串的红灯把这20秒放大了, 导致到最后耽误了几分钟.有点像蝴蝶效应.

一直感观认为第一个路口耽误的时间会放大, 不知道有没有别人和我一样的第一感?

写了一个程序验证了一下, 因为和第一感不一样, 所以也不确认程序模拟的对不对...

初始化20个红绿灯, 随机红灯时长和绿灯时长. 过马路需要6秒.

两组做为对比, 一个是当前就在第一个路口, 另一个做对比的是20秒后到了第一个路口.

和我之前想的不一样, 迟到的人很快就在下一个路口或者是再下个路口和与另一组的人追平了. 极少极少有时间被放大的情况(以至于我根本没有观察到这种情况)

大规模模拟下来, 平均来看, 在第一个路口晚N秒完全不影响20个路口之后的最终到达时间.

模拟的结果如下, 20个红绿灯, 过马路都是6秒, 结果第一行代表程序开始就在第一个路口, 第二行代表等了一秒才到路口, 20行代表过了20秒才到第一个路口. 考虑到第一个路口之前多出的时间, 最后一行仅比第一行多用了17秒不到(是不是哪里搞错了?)

```
% python testTrafficLight.py -c 20 -w 6 -f 20 -cmd test
430.417
430.769
431.635
433.063
433.691
434.682
435.472
436.63
437.583
438.256
439.35
440.291
440.833
442.243
442.864
443.935
445.133
445.941
446.375
447.004
```

完整代码如下:

```py
#!/usr/bin/env python
# -*- coding: utf-8 -*-
import random
import argparse
from copy import deepcopy


def init(c, maxred, minred, maxgreen, mingren):
    lights = []
    for i in range(c):
        green_time = random.randint(minred, maxred)
        #green_time = 20
        red_time = random.randint(mingren, maxgreen)
        #red_time = 75
        light = [green_time, red_time, random.randint(0, green_time+red_time)]
        lights.append(light)
    return lights


def evaluate(f, w, lights):
    all_wait_time = f
    for l in lights:
        l[-1] = (l[-1]+f) % (sum(l[:2]))

    for i in range(len(lights)):

        light = lights[i]

        if light[-1] < light[0]:  # red
            wait_time = light[0]-light[-1]+w
        elif light[-1]+w > light[0]+light[1]: #green time is not enough
            wait_time = light[0]+light[1]-light[-1]+light[0]+w
        else:
            wait_time = w

        all_wait_time += wait_time

        for l in lights:
            l[-1] = (l[-1]+wait_time) % (l[0]+l[1])

    return all_wait_time


def main():
    random.seed(1)
    lights = init(
        args.c,
        args.maxred,
        args.minred,
        args.maxgreen,
        args.mingren)

    print evaluate(args.f, args.w, lights)


def test():
    s = [0]*args.f

    for i in range(1000):
        lights = init(
            args.c,
            args.maxred,
            args.minred,
            args.maxgreen,
            args.mingren)
        for j in range(args.f):
            all_wait_time = evaluate(j, args.w, deepcopy(lights))
            s[j] += all_wait_time

    for idx,e in enumerate(s):
        print 1.0*e/1000


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("-cmd", default="main")
    parser.add_argument("-l", default="DEBUG")
    parser.add_argument(
        "-c",
        type=int,
        default=10,
        help="how many traffic lights,default 10")
    parser.add_argument(
        "-f",
        type=int,
        default=10,
        help="how long should the first light take")
    parser.add_argument(
        "-w",
        type=int,
        default=5,
        help="how long should one light take")
    parser.add_argument("-maxred", type=int, default=75)
    parser.add_argument("-minred", type=int, default=20)
    parser.add_argument("-maxgreen", type=int, default=75)
    parser.add_argument("-mingren", type=int, default=20)
    args = parser.parse_args()

    eval(args.cmd)()
```
