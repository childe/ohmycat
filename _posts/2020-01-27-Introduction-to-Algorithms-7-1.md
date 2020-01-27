---

title: '算法导论7.1-快排描述'
date: 2020-01-27T15:59:14+0800

---

## 7.1.2

当数据 A[p..r] 中的元素均相同时, Partition 返回的 q 是什么. 修改 Partition, 使得数据 A[p..r] 中的元素均相同时, 返回 q=(p+r)/2

返回 r

我想不到好办法, 只能 i,j 分别从两头想向走. 代码如下:

```python
def partiton(nums, p, r):
    if len(nums) <= 1:
        return 0
    x = nums[r]
    i, j = p, r-1
    while True:
        if nums[i] > x:
            nums[i], nums[j] = nums[j], nums[i]
            j -= 1
        else:
            i += 1
        if i > j:
            break

        if nums[j] < x:
            nums[i], nums[j] = nums[j], nums[i]
            i += 1
        else:
            j -= 1
        if i > j:
            break

    nums[i], nums[r] = nums[r], nums[i]
    return i


def main():
    nums = [2]*6
    q = partiton(nums, 0, len(nums)-1)
    assert q == 3

    nums = [2]*7
    q = partiton(nums, 0, len(nums)-1)
    assert q == 3

    for i in range(10):
        nums = [0]*i
        q = partiton(nums, 0, len(nums)-1)
        assert q == i//2

    nums = list(range(10))
    q = partiton(nums, 0, len(nums)-1)
    assert q == 9

    nums = [1, 2, 3, 4, 6, 7, 8, 9, 5]
    q = partiton(nums, 0, len(nums)-1)
    assert q == 4

    import random
    for _ in range(100):
        nums = []
        for _ in range(10):
            nums.append(random.randint(1, 10))
        q = partiton(nums, 0, len(nums)-1)
        assert not nums[:q] or max(nums[:q]) <= nums[q]
        assert not nums[q+1:] or min(nums[q+1:]) >= nums[q]


if __name__ == '__main__':
    main()
```

## 7.1.4

反过来写一下

```python
def partiton(nums, p, r):
    i=p-1
    x = nums[r]
    for j in range(p,r):
        if nums[j]>x:
            nums[i+1],nums[j] =nums[j],nums[i+1]
            i+=1
    nums[i+1],nums[r] =nums[r],nums[i+1]
    return i+1


def main():
    import random
    for _ in range(1000):
        nums = []
        for _ in range(10):
            nums.append(random.randint(1,10))
            q = partiton(nums,0,len(nums)-1)
            print(nums,q,nums[:q],nums[q+1:],nums[q])
            assert not nums[:q] or min(nums[:q]) >= nums[q]
            assert not nums[q+1:] or max(nums[q+1:]) <= nums[q]

if __name__ == '__main__':
    main()
```
