---

layout: post
title:  "docker image中用sendmail发送crontab的信息"
date:   2017-06-20 14:19:05 +0800

---

我是用的python的官方镜像, 是以dedian为基础镜像的, 所以理论上下面这个方法在ubuntu/debian中也适用吧.

在python的docker镜像中安装了cron, 然后在里面跑一些定时任务. 有些任务crash了, 却没能及时通知到, 所以想着用sendmail及时把消息邮件出去.

- /etc/exim4/passwd.client

这里面修改mail服务器信息和登陆信息

- /etc/exim4/update-exim4.conf.conf

dc_eximconfig_configtype='local' 改成 dc_eximconfig_configtype='internet'

- service exim4 restart
