---

date: 2022-03-22T14:47:09+0800
title: cgroup v2 学习笔记简记

---

## 参考资料

- [Control Group v2 — The Linux Kernel documentation](https://www.kernel.org/doc/html/v5.10/admin-guide/cgroup-v2.html)
- [中文翻译](https://arthurchiao.art/blog/cgroupv2-zh)

## 启用 cgroup-v2

测试系统环境：

```sh
# cat /etc/centos-release
CentOS Linux release 7.6.1810 (Core)

# systemctl --version
systemd 219
+PAM +AUDIT +SELINUX +IMA -APPARMOR +SMACK +SYSVINIT +UTMP +LIBCRYPTSETUP +GCRYPT +GNUTLS +ACL +XZ +LZ4 -SECCOMP +BLKID +ELFUTILS +KMOD +IDN

# uname -a
Linux VMS171583 5.10.56-trip20211224.el7.centos.x86_64 #1 SMP Fri Dec 24 02:11:17 EST 2021 x86_64 x86_64 x86_64 GNU/Linux
```

如果控制器（cpu，memory 等）已经绑定在 cgroup v1，那就没办法再绑定到 cgroup v2 了。

systemd 又是 pid 1 进程，所以第一步需要让 systemd 使用 cgroup v2。

```sh
grubby --update-kernel=ALL --args=systemd.unified_cgroup_hierarchy=1
```

使用上面命令添加内核启动参数，然后重启，可以让 systemd 使用 cgroup v2。

但我的测试环境中，这个版本的 systemd 还不支持 cgroup v2，所以添加了这个参数也没用。[https://github.com/systemd/systemd/issues/19760](https://github.com/systemd/systemd/issues/19760)

所以需要强制关闭 cgroup v1：

```sh
grubby --update-kernel=ALL --args=cgroup_no_v1=all
```

重启之后，`mount | grep cgroup` 可以看到 cgroup v1 的 mount 已经没有了。(可能 systemd 不能再对服务做资源控制了？未验证)

### mount cgroup v2

```sh
# mkdir /tmp/abcd
# mount -t cgroup2 nodev /tmp/abcd/
# mount | grep cgroup2
nodev on /tmp/abcd type cgroup2 (rw,relatime)
```

成功 mount cgroup v2 了，接下来就能使用 v2 做资源控制了。

## 开启 CPU 限制

看一下 v2 里面有哪些可用的控制器

```sh
# cat cgroup.controllers
cpuset cpu io memory hugetlb pids
```

创建一个 child cgroup

```sh
# cd /tmp/abcd
[root@VMS171583 abcd]# mkdir t
```

开启 CPU 控制器

```sh
cd /tmp/abcd

[root@VMS171583 abcd]# ll t
total 0
-r--r--r-- 1 root root 0 Mar 22 15:10 cgroup.controllers
-r--r--r-- 1 root root 0 Mar 22 15:10 cgroup.events
-rw-r--r-- 1 root root 0 Mar 22 15:10 cgroup.freeze
-rw-r--r-- 1 root root 0 Mar 22 15:10 cgroup.max.depth
-rw-r--r-- 1 root root 0 Mar 22 15:10 cgroup.max.descendants
-rw-r--r-- 1 root root 0 Mar 22 15:10 cgroup.procs
-r--r--r-- 1 root root 0 Mar 22 15:10 cgroup.stat
-rw-r--r-- 1 root root 0 Mar 22 15:10 cgroup.subtree_control
-rw-r--r-- 1 root root 0 Mar 22 15:10 cgroup.threads
-rw-r--r-- 1 root root 0 Mar 22 15:10 cgroup.type
-r--r--r-- 1 root root 0 Mar 22 15:10 cpu.stat

echo "+cpu" > cgroup.subtree_control

[root@VMS171583 abcd]# ll t
total 0
-r--r--r-- 1 root root 0 Mar 22 15:10 cgroup.controllers
-r--r--r-- 1 root root 0 Mar 22 15:10 cgroup.events
-rw-r--r-- 1 root root 0 Mar 22 15:10 cgroup.freeze
-rw-r--r-- 1 root root 0 Mar 22 15:10 cgroup.max.depth
-rw-r--r-- 1 root root 0 Mar 22 15:10 cgroup.max.descendants
-rw-r--r-- 1 root root 0 Mar 22 15:10 cgroup.procs
-r--r--r-- 1 root root 0 Mar 22 15:10 cgroup.stat
-rw-r--r-- 1 root root 0 Mar 22 15:10 cgroup.subtree_control
-rw-r--r-- 1 root root 0 Mar 22 15:10 cgroup.threads
-rw-r--r-- 1 root root 0 Mar 22 15:10 cgroup.type
-rw-r--r-- 1 root root 0 Mar 22 15:14 cpu.max
-r--r--r-- 1 root root 0 Mar 22 15:10 cpu.stat
-rw-r--r-- 1 root root 0 Mar 22 15:14 cpu.weight
-rw-r--r-- 1 root root 0 Mar 22 15:14 cpu.weight.nice
```

可以看到 CPU 的接口文件就自动创建好了。

更改一下 CPU 资源控制的参数：

```sh
cd /tmp/abcd/t
echo 20000 100000 > cpu.max
```

跑一个 Python 死循环脚本，可以看到 CPU 使用率100%。

```
cd /tmp/abcd/t
echo $pythonPID > cgroup.procs
```

可以看到 python 进程的 CPU 使用率被限制到 20% 了。
