---

layout: post
date: 2018-08-20T18:50:55+0800
title: 部署superset+clickhouse

---

我选择使用docker方式安装部署, 虽然中间碰到两个坑, 但对于之后的二次部署或者多次部署,应该还是简单一些.

<!--more-->

## 下载镜像

`docker pull amancevice/superset`

这应该是第三方的小哥哥自己作的, [https://hub.docker.com/r/amancevice/superset/](https://hub.docker.com/r/amancevice/superset/)

其实部署过程已经说的很清楚了, 但我有些想当然, 没有完全照做, 踩了第一个坑.

简单起见, 我选择sqlite做配置(应该是包括数据源,chart,dashboard等配置)的存储, 默认也是sqlite. sqlite的数据文件在 `/var/lib/superset` . **注意这里最好是挂载到本地, 原因下面马上提到.**

docker跑起来之后, 需要做一个数据库的初始化.

```
docker run --detach --name superset [options] amancevice/superset
docker exec -it superset superset-init
```

**注意, 初始化之后, docker容器需要重启才能生效!**

**但是呢, 如果不把 /var/lib/superset 挂载到本地, 重启后可能会数据丢失. (如果不是restart container)**

我是把sqlite的数据文件考出来, 用他做了一个新的 image . 实际生产环境可能使用远端的 mysql 等数据库, 所以不用担心上面这种数据丢失的问题.

## 升级infi.clickhouse_orm

如果用clickhouse做数据源, 需要把 `infi.clickhouse_orm` 升级到1.0.0或者更高版本.

前面提到, 我是做了新的image. 开始直接在dockerfile写的 `RUN pip3 install infi.clickhouse_orm==1.0.1`

但是因为docker里面用户使用了superset的原因, 这里的1.0.1版本的infi.clickhouseorm, 并没有在启动superset的时候被使用.

对docker实在不太熟悉, 不知道如何在dockerfile里面用某个用户RUN命令. 最后这样写的:

```
FROM amancevice/superset
USER root
RUN pip3 uninstall -y infi.clickhouse_orm
RUN pip3 install infi.clickhouse_orm==1.0.1 --index-url http://pypi.douban.com/simple  --trusted-host pypi.douban.com
ADD superset.db /var/lib/superset/
ADD superset_config.py /etc/superset/
```
