---

layout: post
title:  "nginx的路径变化"
date:   2017-06-12 13:45:10 +0800

---

经常搞不清楚nginx的路径变化,特别是在proxy_pass的时候. 看下官方文档了解一下.

[http://nginx.org/en/docs/http/ngx_http_core_module.html#location](http://nginx.org/en/docs/http/ngx_http_core_module.html#location)和
[http://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass](http://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)

<!--more-->

## 先看一下路径的匹配规则

官方资料见 [http://nginx.org/en/docs/http/ngx_http_core_module.html#location](http://nginx.org/en/docs/http/ngx_http_core_module.html#location)

location语法是这样的 `location [ = | ~ | ~* | ^~ ] uri { ... }` , []里面的东西代表可有可无. 举一个例子

```
location = / {
    [ configuration A ]
}

location / {
    [ configuration B ]
}

location /documents/ {
    [ configuration C ]
}

location ^~ /images/ {
    [ configuration D ]
}

location ~* \.(gif|jpg|jpeg)$ {
    [ configuration E ]
}
```

nginx在匹配路径之前, 会首先把uri中%XX这样格式的内容先解码, 然后把. ..转成绝对路径, 以及把多个//合并成一个/

在说明匹配规则前, 还是先解释一下上面这个语法什么意思. ~ ~\*这两个代表uri是一个正则表达式, ~是大小写敏感, ~\*是大小写不敏感.  *^~可不是正则的意思,后面会有解释*. 其它情况下, uri代表一个路径前缀.

匹配路径按以下规则进行:

1. 先序遍历所有路径前缀, 把匹配的规则中*最长的那个*记录下来. 然后*按顺序*遍历所有正则, 第一个正则匹配成功之后就停下来. 如果没有正则可以成功匹配, 选用最长长度的前缀路径.

2. 如果*最长的*前缀路径有 ^~ 修饰符, 直接选用这个, 1步骤里面的正则匹配就不用了.

3. 在第一步遍历路径前缀时, 如果前缀路径有 = 修饰符, 则停止继续寻找,直接使用这个.

4. uri前面加一个@, 叫做 named location, 普通的请求不管他, 只用在一些内部的跳转上, 比如下面这样

        location / {
            error_page 404 = @fallback;
        }

        location @fallback {
            proxy_pass http://backend;
        }

5. 如果一个前缀路径最后以/结尾, 而且请求被proxy_pass, fastcgi_pass, uwsgi_pass, scgi_pass, or memcached_pass中的一个处理, 这个情况比较特殊: 请求如果不以/结尾, 会返回一个301的重定向响应, 再最后加上/. 如果不想这样, 就要用 = 修饰符做精确匹配, 像下面这样

        location /user/ {
            proxy_pass http://user.example.com;
        }
        location = /user {
            proxy_pass http://login.example.com;
        }

## proxy_pass中的路径变换

我们用nginx curl python -m SimepleHTTPServer来做测试

- 如果proxy_pass含有URI,那么把标准化之后的Url中匹配location的那部分换成proxy_pass指令中的URI.

        server {
            listen 8080;
            server_name proxy-pass-test-1.localhost;

            location /name/ {
                proxy_pass http://127.0.0.1:8000/remote/;
            }
        }

        curl proxy-pass-test-1.localhost:8080/name/abcd/xyz
        127.0.0.1 - - [12/Jun/2017 14:16:32] "GET /remote/abcd/xyz HTTP/1.0" 404 -

- 如果proxy_pass没有URI, 那么完整的URI全部传递过去.

        server {
            listen 8080;
            server_name proxy-pass-test-2.localhost;

            location /name/ {
                proxy_pass http://127.0.0.1:8000;
            }
        }

        curl proxy-pass-test-2.localhost:8080/name/abcd/xyz
        127.0.0.1 - - [12/Jun/2017 14:23:18] "GET /name/abcd/xyz HTTP/1.0" 404 -

有些情况下, 无法判断被替换的部分, 比如:

- location是正则匹配的, 或者是使用的named location

    这种情况下, proxy_path不能使用URI

- URI在内部被rewrite改变了, proxy_pass中的URI被忽略,完整的改变后的URI被传递.

        server {
            listen 8080;
            server_name proxy-pass-test-3.localhost;

            location /name/ {
                rewrite    /name/([^/]+) /users?name=$1 break;
                proxy_pass http://127.0.0.1:8000;
            }
        }

        server {
            listen 8080;
            server_name proxy-pass-test-4.localhost;

            location /name/ {
                rewrite    /name/([^/]+) /users?name=$1 break;
                proxy_pass http://127.0.0.1:8000/remote/;
            }
        }

        curl -i proxy-pass-test-3.localhost:8080/name/childe
        127.0.0.1 - - [12/Jun/2017 14:36:29] "GET /users?name=childe HTTP/1.0" 404 -

        curl -i proxy-pass-test-3.localhost:8080/name/childe
        127.0.0.1 - - [12/Jun/2017 14:36:35] "GET /users?name=childe HTTP/1.0" 404 -

- proxy_pass中使用变量

        server {
            listen 8080;
            server_name proxy-pass-test-5.localhost;

            location /name/ {
                proxy_pass http://127.0.0.1:8080/$request_uri;
            }
        }
        curl -i proxy-pass-test-5.localhost:8080/name/abcd/xyz
        127.0.0.1 - - [12/Jun/2017 14:41:02] "GET /name/abcd/xyz HTTP/1.0" 404 -
