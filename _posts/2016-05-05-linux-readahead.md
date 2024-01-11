---

layout: post
title:  "linux下读取磁盘时缓冲区大小如何影响性能"
date:   2016-05-05 20:46:16 +0800
keywords: linux io readahead buffer-size

---

从[每次read时的buffer size如何影响性能](http://gitcommit.today/2016/04/20/read-how-buffer-size-effect.html), [每次read时的buffer size如何影响性能2](http://gitcommit.today/2016/04/21/read-how-buffer-size-effect-2.html) 总结来的. 这两篇都是一些当时的想法, 对的, 和错的. 现在总结一下.

这篇日志其实就是围绕Unix环境高级编程表3-2来讲的.

![Unix环境高级编程表3-2](/images/linux-readahead-1.png)

把我这边的测试结果记录一下, 后面会详细说明如何测试的. **数据大写是100M, 禁用readahead, 磁盘IO次数不精确, 因为上面还有别的应用在跑,仅供参考用.**

| buffsize | 用户CPU(秒) | 系统CPU(秒) | 时钟时间(秒) | 磁盘IO次数 | IO时间 |
| -------- | ----------- | ----------- | ------------ | ---------- | ------ |
| 1        | 7.247       | 40.746      |  54.382      | 26962      | 6.362  |
| 2        | 3.665       | 19.393      |  28.608      | 26354      | 5.55   |
| 4        | 1.908       | 10.095      |  17.255      | 25906      | 5.252  |
| 8        | 1.000       | 5.879       |  11.857      | 25810      | 4.878  |
| 16       | 0.483       | 3.481       |  8.677       | 25985      | 4.713  |
| 32       | 0.283       | 2.195       |  7.067       | 25982      | 4.589  |
| 64       | 0.158       | 1.623       |  6.105       | 25711      |
| 128      | 0.094       | 1.414       |  5.920       | 25796      |
| 256      | 0.080       | 1.105       |  5.468       | 25794      |
| 512      | 0.057       | 1.057       |  5.278       | 25765      |
| 1024     | 0.049       | 0.821       |  4.988       | 25713      |
| 2048     | 0.054       | 0.898       |  5.045       | 25748      |
| 4096     | 0.040       | 0.854       |  5.124       | 25850      |
| 8192     | 0.033       | 0.919       |  4.970       | 25965      |
| 16394    | 0.017       | 0.898       |  5.164       | 25762      |

*表格1: 不同buffer size下的cpu使用情况*


## readhead, 暂时先不管它, 后面再说

系统读取磁盘数据时, 会认为磁盘中接下来的连续数据也会很快被用到, 所以会预读取更多的数据, 这个叫做readahead.

我们先不考虑readhead, 后面再说. 为了消除readahead影响, 先把readahead设置为0. `blockdev --setra 0 /dev/sda
`

## block size

`blockdev --getbsz /dev/sda` 可以获取磁盘的block size大小.

Linux系统读取文件时(不考虑readahead), 一次会从磁盘中读取block size大小的数据, 哪怕只是`read(fd, buf, 1)`, 也会从磁盘读取block size的数据.

在我这个测试用的电脑上, block size是4096(bytes).  
所以如果每次read(1)和每次read(4096), 虽然前者调用read的次数多了非常多倍, 但实际上磁盘IO次数是一样的. 因为循环次数特别多, 所以user cpu和sys cpu会多很多. 但用时钟时间减去前两者,实际使用的IO时间是差不多的.

## read(>4096)

如果调用read函数时, buffer size大于block size呢, 会不会进一步减少磁盘IO次数?  
如果block size是4096, 我一个read(8192)调用, 会不会一次IO操作读取8192字节呢?  
答案是不会的, 因为即使是一个文件, 存在磁盘的时候, 在物理结构上未必就是顺序存放的. 所以系统还是要一个个block size去读取, 然后再判断接下来应该读取哪一块block, 否则按照read的参数一次性读取很多, 很有可能是浪费的.

## readahead

前面说到, 系统读取磁盘数据时, 会认为磁盘中接下来的连续数据也会很快被用到, 所以会预读取更多的数据, 这个叫做readahead.

在有大量顺序读取磁盘的时候, readahead可以大幅提高性能. 但是大量读取碎片小文件的时候, 这个可能会造成浪费. 所以是不是调高还是看具体应用.

把readahead设置为256之后的测试结果, buffer size是1, 磁盘IO次数是922

```
real    0m43.212s
user    0m6.715s
sys     0m36.257s
922
```


## 测试方法

1. 用dd创建一个100M大小的文件
2. 每次操作前, 先`echo 3 > /proc/sys/vm/drop_caches`清一下, 这个不保证马上清掉, 最好sleep一下
3. 记录操作前的磁盘IO次数 `read1=$(cat /proc/diskstats | grep dm-0 | awk '{print $4}')`
4. dd读取数据. `time dd if=testfile of=/dev/null ibs=$@`
5. 记录操作后的磁盘IO次数 `read2=$(cat /proc/diskstats | grep dm-0 | awk '{print $4}')`

关于/proc/diskstats的解释参考[关于/proc/diskstats的解释](https://www.kernel.org/doc/Documentation/iostats.txt)
