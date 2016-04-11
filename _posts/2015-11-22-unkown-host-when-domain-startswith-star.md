---
layout: post
title:  "ping的时候unknown host"
date:   2015-11-22 22:25:39 +0800
modifydate: 2016-04-11 19:47:41 +0800
abstract:   "前几天有个前同事出了个题目考我们, 在linux上面ping item.jd.hk, 或者是curl的时候, 报unknown host的错误. 让我们想一下原因是什么. \n查了一下午, 发现glibc里面的gethostbyname这个函数, 在解析A记录的时候,如果A记录的host以*打头,就返回错误"
keywords: dhcp gethostbyname unknown host
categories: net
---

前几天有个前同事出了个题目考我们, 在linux上面ping item.jd.hk, 或者是curl的时候, 报unknown host的错误. 但是windows, mac上面正常. 让我们想一下原因是什么.

先host看一下,

    % host item.jd.hk       
    item.jd.hk is an alias for *.jd.hk.gslb.qianxun.com.
    *.jd.hk.gslb.qianxun.com has address 106.39.164.182
    *.jd.hk.gslb.qianxun.com has address 120.52.148.32

先是Cname到 *.jd.hk.gslb.qianxun.com, 然后 *.jd.hk.gslb.qianxun.com是指向两个IP. 看起来好像没有问题.

但ping的时候, 的确会报错

    % ping item.jd.hk
    ping: unknown host item.jd.hk


网上搜索一下ping的源码, 很快就可以定位, 是gethostbyname这个函数返回了Null

```c
hp = gethostbyname(target);
if (!hp) {
    (void)fprintf(stderr,
        "ping: unknown host %s\n", target);
    exit(2);
}
```

然后找gethostbyname的代码, 这个是glibc的函数, google了好一番,终于找到这里:https://fossies.org/dox/glibc-2.23/gethnamaddr_8c_source.html#l00486 (当前还是2.23, 以后版本更新后, 可能需要相应的修改URL)

gethostbyname调用了gethostbyname2, gethostbyname2最后是调用了2个函数. 先是querybuf发送一个dns查询的请求,然后getanswer解析dns请求的返回.

```c
struct hostent *
gethostbyname (const char *name)
{
    struct hostent *hp;

    if (__res_maybe_init (&_res, 0) == -1) {
        __set_h_errno (NETDB_INTERNAL);
        return (NULL);
    }
    if (_res.options & RES_USE_INET6) {
        hp = gethostbyname2(name, AF_INET6);
        if (hp)
            return (hp);
    }
    return (gethostbyname2(name, AF_INET));
}
```

```c
struct hostent *
gethostbyname2 (const char *name, int af)
{
    ...
    ...

    buf.buf = origbuf = (querybuf *) alloca (1024);

    if ((n = __libc_res_nsearch(&_res, name, C_IN, type, buf.buf->buf, 1024,
                    &buf.ptr, NULL, NULL, NULL, NULL)) < 0) {
        if (buf.buf != origbuf)
            free (buf.buf);
        Dprintf("res_nsearch failed (%d)\n", n);
        if (errno == ECONNREFUSED)
            return (_gethtbyname2(name, af));
        return (NULL);
    }
    ret = getanswer(buf.buf, n, name, type);
    if (buf.buf != origbuf)
        free (buf.buf);
    return ret;
```

通过tcpdump抓包, 可以看到请求正常的发出了, 也收到了正确的返回(tpcumpd里面可以看到完整的记录和解析)

    192.168.0.1.53 > 192.168.0.110.37612: 37604 3/0/0 item.jd.hk. CNAME *.jd.hk.gslb.qianxun.com., *.jd.hk.gslb.qianxun.com. A 120.52.148.32, *.jd.hk.gslb.qianxun.com. A 106.39.164.182 (98)

所以querybuf可以不用看, 直接看getanswer. 

getanswer, 简单来说, 就是解析dns response里面的内容, 一一检查分析.

如果当前记录是A记录(不明白当前记录是A记录什么意思的,以及看不懂上面的tcpdump内容的, 可以搜索一下dns返回的格式),就会调用name_ok(也就是res_hnok这个函数). 在res_hnok中, 如果认为response中格式有错, 直接跳出解析的while循环, 然后返回Null, 随后gethostbyname也返回Null. (errno在哪里设置的, 找不到了, 印象中那天还找到了).

res_hnok函数的定义在[https://fossies.org/dox/glibc-2.23/res__comp_8c_source.html](https://fossies.org/dox/glibc-2.23/res__comp_8c_source.html)

```c
int
res_hnok(const char *dn) {
    int pch = PERIOD, ch = *dn++;

    while (ch != '\0') {
        int nch = *dn++;

        if (periodchar(ch)) {
            (void)NULL;
        } else if (periodchar(pch)) {
            if (!borderchar(ch))
                return (0);
        } else if (periodchar(nch) || nch == '\0') {
            if (!borderchar(ch))
                return (0);
        } else {
            if (!middlechar(ch))
                return (0);
        }
        pch = ch, ch = nch;
    }
    return (1);
}
```

京东把*.jd.hk Cname到了*.jd.hk.gslb.qianxun.com, *.jd.hk.gslb.qianxun.com又A记录到了IP. 
这样的话, gethostbyname在解析到*.jd.hk.gslb.qianxun.com的时候, 当做A记录解析, 但第一个字母是*, 报错返回Null.

实际上, 把一个特定的域名, 比如 item.jd.hk Cname到了*.jd.hk.gslb.qianxun.com,然后再到A记录,也是同样的问题. 本质上就是,dns返回的所有回答里面,A记录的host要符合res_hnok函数的检查.  域名的规范可以参考[rfc 1035](https://www.ietf.org/rfc/rfc1035.txt) 2.3.1章节.

### 解决方案

和前同事也确认了一下他们的解决方案, 就是把*.jd.hk指向star.jd.hk.gslb.qianxun.com, star.jd.hk.gslb.qianxun.com再配置A记录.

### 后续

1. 如果配置了*.jk.hk A XXX.XXX.XXX.XXX, 可以直接查询*.jk.hk这个东西, 也是可以返回这个IP的, 但同样的原因, host tcpdump都可以看到,但ping curl会报错.  如果是查询item.jd.hk, 会返回item.jd.hk A XXX.XXX.XXX.XXX这种回答,完全符合规范.

2. 我回家之后继续测试的时候, 发现随便找一个host, 比如abcdfadsf.jh.hk,第一次是unknown host,第二次就OK了. 抓包分析发现, 是我的路由器把这条记录缓存了, 第二次ping的时候, 直接返回了如abcdfadsf.jh.hk A XXX.XXX.XXX.
