---

layout: post
title: 'nginx 500 错误: client_body_temp Permission denied'
date: 2016-12-08 16:19:18 +0800

---

nginx做代理, proxy_pass代理后面的应用. 用户反应大量请求的时候, 会得到500错误.

我看了是access日志之后, 发现request body为空. 以为是用户调用出错.

后来配合用户做tcpdump, 发现client还在发送request body, 没发完呢, nginx就直接返回500, 然后close connection了. client还在坚持继续发完了request body, 然后close.

然后上网搜索, 我盲目的关键词居然很快就找到了答案. [https://wincent.com/wiki/Fixing_nginx_client_body_temp_permission_denied_errors](https://wincent.com/wiki/Fixing_nginx_client_body_temp_permission_denied_errors) google 真好.

报错是因为request body比较大的时候, nginx会先把一部分数据缓存到磁盘, 但写磁盘的目录又没有权限, 所以直接抛出了500报错.

解决方案也简单, 就是给权限, 或者重新配置一下 [client_body_temp_path](http://nginx.org/en/docs/http/ngx_http_core_module.html#client_body_temp_path)

多看一眼error.log就能直接找到解决方案的. 不过在tcpdump的过程中学到了sack的的用法, 也挺好的.
