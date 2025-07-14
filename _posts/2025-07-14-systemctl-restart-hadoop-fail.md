---

date: 2025-07-14T10:55:03+0800
title: systemctl-restart-hadoop-datanode-fail
layout: post

---

## 现象

airflow JOB 中，重启 Hadoop Datanode 经常失败，然后登陆到机器看，已经成功了

### journalctl 日志

```
Jul 10 17:18:05 XXXX systemd[1]: Started Hadoop datanode.
Jul 10 17:18:05 XXXX hadoop-hdfs-datanode[3678026]: Started Hadoop datanode (hadoop-hdfs-datanode):[  OK  ]
Jul 10 17:17:56 XXXX su[3677203]: pam_unix(su:session): session opened for user root(uid=0) by (uid=0)
Jul 10 17:17:56 XXXX su[3677203]: (to root) root on none
Jul 10 17:17:56 XXXX systemd[1]: Starting Hadoop datanode...
Jul 10 17:17:56 XXXX systemd[1]: Stopped Hadoop datanode.
Jul 10 17:17:56 XXXX systemd[1]: datanode.service: Scheduled restart job, restart counter is at 1.
Jul 10 17:15:56 XXXX systemd[1]: Failed to start Hadoop datanode.
Jul 10 17:15:56 XXXX systemd[1]: datanode.service: Failed with result 'exit-code'.
Jul 10 17:15:56 XXXX systemd[1]: datanode.service: Control process exited, code=exited, status=1/FAILURE
Jul 10 17:15:56 XXXX hadoop-hdfs-datanode[3675354]: Failed to start Hadoop datanode. Return value: 1[FAILED]
Jul 10 17:15:46 XXXX su[3675290]: pam_unix(su:session): session opened for user root(uid=0) by (uid=0)
Jul 10 17:15:46 XXXX su[3675290]: (to root) root on none
Jul 10 17:15:46 XXXX systemd[1]: Starting Hadoop datanode...
Jul 10 17:15:46 XXXX systemd[1]: Stopped Hadoop datanode.
Jul 10 17:15:46 XXXX systemd[1]: datanode.service: Failed with result 'signal'.
Jul 10 17:15:46 XXXX hadoop-hdfs-datanode[3675282]: Stopped Hadoop datanode:[  OK  ]
Jul 10 17:15:46 XXXX systemd[1]: datanode.service: Main process exited, code=killed, status=9/KILL
Jul 10 17:15:46 XXXX hadoop-hdfs-datanode[3675238]: datanode did not stop gracefully after 5 seconds: killing with kill -9
Jul 10 17:15:41 XXXX hadoop-hdfs-datanode[3675238]: stopping datanode
Jul 10 17:15:41 XXXX systemd[1]: Stopping Hadoop datanode...
```

日志显示，Stop 之后，第一次 Start 失败了，第二次 Start 成功了。

### 服务配置

```
# cat /etc/systemd/system/datanode.service
[Unit]
Description=Hadoop datanode
After=syslog.target local-fs.target network-online.target rc-local.service
Requires=rc-local.service

[Service]
Type=forking
#RemainAfterExit=yes
ExecStart=/etc/init.d/hadoop-hdfs-datanode start
ExecStop=/etc/init.d/hadoop-hdfs-datanode stop
ExecStartPost=/usr/bin/cp /run/hadoop-hdfs/hadoop-hdfs-datanode.pid /run/
PIDFile=/run/hadoop-hdfs-datanode.pid
TimeoutStartSec=60
Restart=always
RestartSec=120

[Install]
WantedBy=multi-user.target
```

120 秒重启是 datanode 的配置。

因为我自己对 hadoop java jsvc 这套东西完全不熟悉，开始没有在 jsvc 的日志中找到关键信息，也对 jsvc 的机制不了解，没有马上定位到原因。一度拿 bcc 中的 execsnoop 来定位，但这个版本的 bcc 好像有 Bug，exec 的信息中，所有 ret code 都是 0。但基本上也能定位到是 jsvc 启动时出错（启动后退出了，和 pidfile 中的 pid 不一致）。


/opt/log/hadoop/jsvc.err 中的一条关键日志如下：

```
Still running according to PID file /var/run/hadoop-hdfs/hadoop_secure_dn.pid, PID is 3911276
Service exit with a return value of 122
```

## 原因

中间的排查过程已经不完全记得了，直接总结下原因吧。

### start and stop

在我们公司的 hadoop 启停脚本中，机制是这样的：

使用 jsvc 来启动 datanode。

stop 的时候，先是 `kill`，如果 5 秒之后进程还在，就使用 `kill -9` 来结束。

### jsvc 中 kill 效果

jsvc 在启动后，会有一个父进程（进程号2）和子进程（进程号3）。

pidfile 中记录的是子进程的 pid。

hadoop 服务的脚本中，kill 的时候，kill 的是父进程。

如果是默认的 kill TERM，父进程会尝试 gracefully 停止子进程。

如果是 kill -9，父进程会直接结束，子进程不会被杀掉。

### 我们公司的服务 stop 时发生了什么

1. kill 父进程（不是 pidfile 里面的）
2. 父进程收到信号后，尝试 gracefully 停止子进程
3. 5 秒后，父子进程还在（因为有些 gracefull 任务），父进程被 kill -9
4. 子进程没有被杀掉，仍然在运行 gracefull 任务
5. systemd 认为服务已经停止，尝试重新启动服务
6. jsvc 启动时，发现 pidfile 中的 pid 仍然在运行（子进程），因此认为服务仍然在运行，退出
7. systemd 认为服务启动失败
8. systemd 重启服务，第二次启动是在 120 秒之后，子进程的 gracefull 任务已经完成，进程退出，pidfile 中的 pid 不再存在。服务启动成功

## 解决方案

整个服务的脚本有些复杂，多个脚本调用流程过长。pid 文件也有多个，一个在 systemd 中使用，用来判断服务是不是在运行，一个在 jsvc 中用在 -pid 参数中。

对我来说，直接修改脚本比较麻烦。

所以在 airflow 中添加了 retry 机制，间隔 15 秒。

因为实践下来发现，当第一次 `systemd restart` 失败之后，15秒之后的第二次 `systemctl restart` ，会等待到 120 秒之后，才会和 systemctl 自己的重试一次执行。

但这也只是工程上的一个 workaround。不太好。

但相比全部重写脚本并推送到几千台机器，这个 workaround 影响面比较小，先这样。

如果从头重写脚本，我自己觉得不要使用 jsvc 比较好，就直接使用 systemd 自己的机制就可以。

如果已经这样使用了 jsvc 了，也不要仅仅等待 5 秒就 `kill -9`，可以和 systemd 配置对等，等待默认的 90 秒左右，可以适当少一些，避免和systemd 的重试时间冲突。
