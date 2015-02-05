---
layout: post
title:  "红绿灯"
date:   2015-01-30 12:07:55 +0800
abstract:   "有天冲到十字路口, 可是刚刚变成红灯,等了20秒. 接下来还有十几个路口, 就想这次红灯等了20秒, 会不会一连串的红灯把这20秒放大了, 导致到最后耽误了几分钟.有点像蝴蝶效应"
categories: game
---

# 这是什么鬼

有天冲到十字路口, 可是刚刚变成红灯,等了20秒. 接下来还有十几个路口, 就想这次红灯等了20秒, 会不会一连串的红灯把这20秒放大了, 导致到最后耽误了几分钟.有点像蝴蝶效应.

一直感观认为第一个路口耽误的时间会放大, 不知道有没有别人和我一样的第一感?

写了一个程序验证了一下, 因为和第一感不一样, 所以也不确认程序模拟的对不对...

初始化20个红绿灯, 随机红灯时长和绿灯时长. 过马路需要6秒.

两组做为对比, 一个是当前就在第一个路口, 另一个做对比的是20秒后到了第一个路口.

和我之前想的不一样, 迟到的人很快就在下一个路口或者是再下个路口和与另一组的人追平了. 极少极少有时间被放大的情况(以至于我根本没有观察到这种情况)

大规模模拟下来, 平均来看, 在第一个路口晚N秒完全不影响20个路口之后的最终到达时间.


# 模拟结果

模拟的结果如下, 20个红绿灯, 过马路都是6秒, 结果第一行代表程序开始就在第一个路口, 第二行代表等了一秒才到路口, 20行代表过了20秒才到第一个路口. 考虑到第一个路口之前多出的时间, 最后一行仅比第一行多用了20秒不到(有没有哪里搞错了?)

```
% python testTrafficLight.py -c 20 -w 6 -f 20 -cmd test
433.329
435.082
436.183
437.105
437.728
438.53
440.029
441.116
441.263
441.538
442.96
443.805
445.111
446.188
448.241
449.592
450.386
451.389
452.043
453.071
```

# 来看一个具体的例子

"随机"生成5个路口. 假设每个路口都需要6秒. 我们是第0秒就赶到了第一个路口可以马上过红绿灯了. 结果如下:

```
[[27, 67, 72], [34, 47, 36], [56, 64, 11], [21, 66, 38], [62, 20, 36]]  #随机生成的路口
0 [[27, 67, 72], [34, 47, 36], [56, 64, 11], [21, 66, 38], [62, 20, 36]] # 第0秒出现在第1个路口
wait_time: 6 #过马路用了6秒
6 [[27, 67, 78], [34, 47, 42], [56, 64, 17], [21, 66, 44], [62, 20, 42]] # 现在在第二个路口了
wait_time: 6
12 [[27, 67, 84], [34, 47, 48], [56, 64, 23], [21, 66, 50], [62, 20, 48]]
wait_time: 39
51 [[27, 67, 29], [34, 47, 6], [56, 64, 62], [21, 66, 2], [62, 20, 5]]
wait_time: 25
76 [[27, 67, 54], [34, 47, 31], [56, 64, 87], [21, 66, 27], [62, 20, 30]]
wait_time: 38
114
```

"随机"生成和之前一样的5个路口. 同样每个路口都需要6秒. 我们是20秒之后才赶到了第一个路口, 很不巧绿灯不到6秒了, 只能等红灯. 结果如下:

```
[[27, 67, 72], [34, 47, 36], [56, 64, 11], [21, 66, 38], [62, 20, 36]] #随机生成的路口
20 [[27, 67, 92], [34, 47, 56], [56, 64, 31], [21, 66, 58], [62, 20, 56]] # 20秒后出现在第1个路口
wait_time: 35 #过马路用了35秒
55 [[27, 67, 33], [34, 47, 10], [56, 64, 66], [21, 66, 6], [62, 20, 9]] # 现在在第二个路口了
wait_time: 30
85 [[27, 67, 63], [34, 47, 40], [56, 64, 96], [21, 66, 36], [62, 20, 39]]
wait_time: 6
91 [[27, 67, 69], [34, 47, 46], [56, 64, 102], [21, 66, 42], [62, 20, 45]]
wait_time: 6
97 [[27, 67, 75], [34, 47, 52], [56, 64, 108], [21, 66, 48], [62, 20, 51]]
wait_time: 17
114
```

可以看到第一个人前2个路口都过得很快, 没有等, 只用了12秒. 但在后面3个路口不巧遭遇了红灯, 被第2个人赶上了..

# 完整代码

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
