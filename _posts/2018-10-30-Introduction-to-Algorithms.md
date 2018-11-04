---

title: 算法导论读书笔记1
layout: post
date: 2018-10-30T10:03:36+0800

---

先占个坑, 督促自己一下.

2018-11-04T19:55:28+0800

# 4.1.1

返回数组里面的最大值, 例子参见下面的 4.1.2

# 4.1.2

```
def find_maximum_subarray(A):
    maximum_subarry_sum = None
    rst = (None, None)
    for i in range(len(A)):
        sum_of_array_i_to_j = 0
        for j in range(i, len(A)):
            sum_of_array_i_to_j += A[j]
            if sum_of_array_i_to_j > maximum_subarry_sum:
                maximum_subarry_sum = sum_of_array_i_to_j
                rst = (i, j)

    return rst


if __name__ == '__main__':
    A = [13, -3, -25, 20, -3, -16, -23, 18, 20, -7, 12, -5, -22, 15, -4, 7]
    i, j = find_maximum_subarray(A)
    print(A[i: j+1])

    import random
    A = []
    for i in range(30):
        A.append(random.randint(-100, -1))

    print(A)
    i, j = find_maximum_subarray(A)
    print(A[i: j+1])
```

# 4.1.3

代码如下, 在我电脑测试时, 临界点为45.  当数组长度小于45时, 采用暴力算法, 显然不会改变性能交叉点. 但比如说, 当数组长度小于10时采用暴力算法, 可以改变性能交叉点.

```
# -*- coding: utf-8 -*-


def find_maximum_subarray_1(A, low, high):
    """
    暴力运算
    """
    maximum_subarry_sum = None
    rst = (None, None)
    for i in range(low, high+1):
        sum_of_array_i_to_j = 0
        for j in range(i, high+1):
            sum_of_array_i_to_j += A[j]
            if sum_of_array_i_to_j > maximum_subarry_sum:
                maximum_subarry_sum = sum_of_array_i_to_j
                rst = (i, j)

    return rst[0], rst[1], maximum_subarry_sum


def find_maximum_subarray(A, low, high):
    """
    分治
    """
    if high - low <= 10:
        return find_maximum_subarray_1(A, low, high)

    mid = (low+high)/2

    left_low, left_high, left_sum = find_maximum_subarray(A, low, mid)
    right_low, right_high, right_sum = find_maximum_subarray(A, mid+1, high)

    left_sum_part, array_sum = None, 0
    for i in range(mid, low-1, -1):
        array_sum += A[i]
        if array_sum > left_sum_part:
            left_sum_part = array_sum
            max_left = i

    right_sum_part, array_sum = None, 0
    for i in range(mid+1, high+1):
        array_sum += A[i]
        if array_sum > right_sum_part:
            right_sum_part = array_sum
            max_right = i

    if left_sum_part+right_sum_part > max(left_sum, right_sum):
        return max_left, max_right, left_sum_part+right_sum_part

    if left_sum > right_sum:
        return left_low, left_high, left_sum

    return right_low, right_high, right_sum


def main():
    import time
    import random
    import sys
    A_length = int(sys.argv[1])
    A_count = int(sys.argv[2]) if sys.argv[2:] else 1000

    all_A = []
    for i in range(A_count):
        all_A.append([random.randint(-100, 100) for _ in range(A_length)])

    start_time = time.time()
    for i in range(A_count):
        find_maximum_subarray_1(all_A[i], 0, A_length-1)
    end_time = time.time()
    print(u'暴力 %.2f' % (end_time - start_time))

    start_time = time.time()
    for i in range(A_count):
        find_maximum_subarray(all_A[i], 0, A_length-1)
    end_time = time.time()
    print(u'分治 %.2f' % (end_time - start_time))


if __name__ == '__main__':
    main()
```
