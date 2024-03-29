---

date: 2022-11-24T15:52:56+0800
title: '为什么 rsyslog 把 etcd 日志采集到了 kernel.log'
layout: post

---

etcd版本:

```
etcd Version: 3.4.9
Git SHA: 54ba95891
Go Version: go1.12.17
Go OS/Arch: linux/amd64
```

经测试，rsyslog 的下面这个配置导致日志采集到了 kernel.log

```
#### RULES ####

# Log all kernel messages to the console.
# Logging much else clutters up the screen.
kern.*                                                  /var/log/kernel
```

rsyslogd 版本

```
rsyslogd 8.29.0, compiled with:
	PLATFORM:				x86_64-redhat-linux-gnu
	PLATFORM (lsb_release -d):
	FEATURE_REGEXP:				Yes
	GSSAPI Kerberos 5 support:		No
	FEATURE_DEBUG (debug build, slow code):	No
	32bit Atomic operations supported:	Yes
	64bit Atomic operations supported:	Yes
	memory allocator:			system default
	Runtime Instrumentation (slow code):	No
	uuid support:				Yes
	Number of Bits in RainerScript integers: 64

See http://www.rsyslog.com for more information.
```

ETCD 在 journald 中的一条日志如下：

```json
{
	"__CURSOR" : "s=78fdc2bf435b4aa6b7df9f50ff1e9c9f;i=662c5390;b=f3260b93a64641889bbf8fed67f4365a;m=2f4d3ea8e9fc;t=5ee329ba40462;x=82eb53b68142dca7",
	"__REALTIME_TIMESTAMP" : "1669276010546274",
	"__MONOTONIC_TIMESTAMP" : "52008810244604",
	"_BOOT_ID" : "f3260b93a64641889bbf8fed67f4365a",
	"PRIORITY" : "7",
	"SYSLOG_IDENTIFIER" : "etcd",
	"_TRANSPORT" : "journal",
	"_PID" : "840",
	"_UID" : "997",
	"_GID" : "993",
	"_COMM" : "etcd",
	"_EXE" : "/usr/local/bin/etcd",
	"_CMDLINE" : "/usr/local/bin/etcd --config-file /etc/etcd/etcd.conf.yml --log-output stderr",
	"_CAP_EFFECTIVE" : "0",
	"_SYSTEMD_CGROUP" : "/system.slice/etcd.service",
	"_SYSTEMD_UNIT" : "etcd.service",
	"_SYSTEMD_SLICE" : "system.slice",
	"_MACHINE_ID" : "c94b645006e94b62b253832779707d12",
	"_HOSTNAME" : "SVR15178IN5112",
	"PACKAGE" : "etcdserver/api/v3rpc",
	"MESSAGE" : "start time = 2022-11-24 15:46:50.545251478 +0800 CST m=+51575280.245951347, time spent = 821.324\uffffffc2\uffffffb5s, remote = 10.4.241.133:54952, response type = /etcdserverpb.KV/Txn, request count = 0, request size = 0, response count = 0, response size = 31, request content = compare:<key:\"cilium/state/identities/v1/id/292984\" version:0 > success:<request_put:<key:\"cilium/state/identities/v1/id/292984\" value_size:196 >> failure:<>",
	"_SOURCE_REALTIME_TIMESTAMP" : "1669276010546119"
}
```

粗看下来，是因为 etcd  使用一些库记录日志到  journald 的时候，没有加 FACILITY 字段。

rsyslog 采集日志的时候，会通过 PRIORITY >> 3 的方式计算 FACILITY。计算结果为0，认为FACILITY 是 kernel。

Rsyslog 的一些 const value: [https://github.com/rsyslog/rsyslog/blob/d083a2a2c20df6852a53e45f1e7a3f47679236d6/runtime/rsyslog.h#L202](https://github.com/rsyslog/rsyslog/blob/d083a2a2c20df6852a53e45f1e7a3f47679236d6/runtime/rsyslog.h#L202)

```c
#define	LOG_KERN	(0<<3)	/* kernel messages */
#define	LOG_USER	(1<<3)	/* random user-level messages */
#define	LOG_MAIL	(2<<3)	/* mail system */
#define	LOG_DAEMON	(3<<3)	/* system daemons */
#define	LOG_AUTH	(4<<3)	/* security/authorization messages */
#define	LOG_SYSLOG	(5<<3)	/* messages generated internally by syslogd */
#define	LOG_LPR		(6<<3)	/* line printer subsystem */
#define	LOG_NEWS	(7<<3)	/* network news subsystem */
#define	LOG_UUCP	(8<<3)	/* UUCP subsystem */
```


Rsyslog 计算 FACILITY 的宏 [https://github.com/rsyslog/rsyslog/blob/d083a2a2c20df6852a53e45f1e7a3f47679236d6/runtime/rsyslog.h#L251](https://github.com/rsyslog/rsyslog/blob/d083a2a2c20df6852a53e45f1e7a3f47679236d6/runtime/rsyslog.h#L251)

```c
pri2fac(const syslog_pri_t pri)
{
	unsigned fac = pri >> 3;
	return (fac > 23) ? LOG_FAC_INVLD : fac;
}
```
