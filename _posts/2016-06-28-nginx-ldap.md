---

layout: post
title:  利用nginx ngx_http_auth_request_module模块做ldap认证
date:   2016-06-28 15:00:38 +0800
categories: nginx
keywords: nginx ldap

---

nginx的[一篇官方博客](https://www.nginx.com/blog/nginx-plus-authenticate-users/)已经给出了非常详细的ldap认证办法, 并给出了[示例代码](https://github.com/nginxinc/nginx-ldap-auth)  
但我并不需要这么多步的跳转; 我需要的是一个就像Basic Auth一样简单的弹出登陆窗口, 因为第一我觉得用户(至少我)觉得弹出窗口简单够用, 第二, 最重要的, 这个可能是给api调用的, 如果api client那边做过多的跳转并不友好.

代码放在[https://github.com/childe/ldap-nginx-golang](https://github.com/childe/ldap-nginx-golang)

## 需要提前了解的2个知识点

### nginx auth_request

ldap认证功能的实现依赖nginx的auth_request这个模块, 但这个模块默认是不安装的, 需要编译nginx的时候加上--with-http_auth_request_module这个参数.

官方文档在[http://nginx.org/en/docs/http/ngx_http_auth_request_module.html](http://nginx.org/en/docs/http/ngx_http_auth_request_module.html)

简单解释一下:

```
location / {
    auth_request /auth-proxy;
    proxy_pass http://backend/;
}
```

这个意思是说, 所有访问先转到/auth-proxy这里, /auth-proxy如果返回401或者403, 则访问被拒绝; 如果返回2xx, 访问允许,继续被nginx转到http://backend/; 返回其他值, 会被认为是个错误.

### WWW-Authenticate

这是一个http的header, 可以用来实现HTTP Basic authentication(BA). BA是对网站做权限控制的最简单的一个形式, 如图

![BA](/images/BA.png)

下面的内容参考[https://en.wikipedia.org/wiki/Basic_access_authentication](https://en.wikipedia.org/wiki/Basic_access_authentication)

#### 它的实现原理是这样的

- 服务器端: 服务器返回401返回码, 并在header里面有如下格式的内容,代表此网页需要做Basic authenticate

    > WWW-Authenticate: Basic realm=""

- 客户端: 发送验证消息, 就是添加一个Authorization的header.
    1. username:password
    2. 对以上内容用base64编码
    3. 对编码后的内容前面加上"Basic "

    最后的内容像下面这样:

    > Authorization: Basic QWxhZGRpbjpPcGVuU2VzYW1l

- URL中编码: 客户端也可以在URL中把认证内容发送过去, 如下:

    > https://Aladdin:OpenSesame@www.example.com/index.html

#### 安全

1. 因为是base64编码的, 并非hash, 所以密码相当于明文的, 一般是配合https一起使用
2. 浏览器一般需要对认证的header提供一个过期机制
3. 服务器并不能提供登出功能. 下面这句没理解... However, there are a number of methods to clear cached credentials in certain web browsers. One of them is redirecting the user to a URL on the same domain containing credentials that are intentionally incorrect.

## 请求被转发路径

明白了上面这些, 需要实现起来就简单了.

先贴一个nginx配置示例

```
http {
    proxy_cache_path cache/  keys_zone=auth_cache:10m;

    upstream backend {
        server 127.0.0.1:9200;
    }

    server {
        listen 80;

        # Protected application
        location / {
            auth_request /auth-proxy;
            proxy_pass http://backend/;
        }

        location = /auth-proxy {
            internal;

            proxy_pass http://127.0.0.1:8080;

            proxy_pass_request_body off;
            proxy_set_header Content-Length "";
            proxy_cache auth_cache;
            proxy_cache_valid 200 403 10m;
        }
    }
}
```

启动一个做ldap认证服务的daemon, 开在127.0.0.1:8080, 代码在[https://github.com/childe/ldap-nginx-golang](https://github.com/childe/ldap-nginx-golang)

1. 用户请求/index.html的时候, 请求被转到 /auth-proxy/index.html (内部, 并非3XX, 对用户透明)
2. /auth-proxy/index.html被我们的daemon处理.
3. 因为第一次请求, 不会有Authorization header, daemon直接返回401, 并带上`WWW-Authenticate: Basic realm=""`的header
4. nginx auth_request模块收到401返回码, 并把401返回给用户
4. 浏览器收到请求, 弹出窗口, 让用户输入用户名密码
5. 浏览器把用户名密码封装到header里面发送到服务器
6. 还是转到/auth-proxy/index.html, 由daemon处理, 这次认证通过, 返回200
7. nginx auth_request模块收到200返回码, 则把url转给http://backend/做处理.
8. http://backend/ 是我们的ES restful服务, 该返回什么返回什么给用户了.


注:
1. 如果用户密码在ldap认证不通过, 或者格式不对等等错误, 直接返回403给用户
2. 每一个用户名/密码会被nginx缓存10分钟
3. internal代表这是一个内部location, 用户直接访问 auth-proxy/ 会返回404
