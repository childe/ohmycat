---

layout: post
title:  "nginx rewrite"
date:   2017-06-12 21:15:20 +0800

---

翻一下[http://nginx.org/en/docs/http/ngx_http_rewrite_module.html](http://nginx.org/en/docs/http/ngx_http_rewrite_module.html)并加一些例子

<!--more-->

rewrite模块的指令执行顺序:

- 所有server次级的rewrite指令依次执行

- 下面的步骤重复执行

    - 按请求的URI定位location
    - 在被定位的location里面顺序执行rewrite的指令
    - 如果请求的URI被rewrite,循环执行. 但不能超过[10次](http://nginx.org/en/docs/http/ngx_http_core_module.html#internal)

## rewrite module的指令有这些

### break

> Stops processing the current set of ngx_http_rewrite_module directives.  
> If a directive is specified inside the location, further processing of the request continues in this location.

不太明白*the current set of ngx_http_rewrite_module directives*是指什么,第二句也不太确定.  
猜一下: *current set of ngx_http_rewrite_module directives*是指当前上下文(server location if)中的rewrite模块的指令.  
第二句是说只是不执行location中的rewrite模块指令, 其它的,比如proxy_pass还是继续执行.

### if

if条件可以有很多种

- a variable name; false if the value of a variable is an empty string or “0”;
- = !=
- ~ ~\*  !~ !~\*
- -f !-f
- -d !-d
- -e !-e
- -x !-x

一些例子

```
if ($http_user_agent ~ MSIE) {
    rewrite ^(.*)$ /msie/$1 break;
}

if ($http_cookie ~* "id=([^;]+)(?:;|$)") {
    set $id $1;


if ($request_method = POST) {
    return 405;
}

if ($slow) {
    limit_rate 10k;

}

if ($invalid_referer) {
    return 403;
}
```

### return

> Syntax:	return code [text];
> return code URL;
> return URL;
> Default:	—
> Context:	server, location, if

301, 302, 303, 307, and 308这些返回码可以带一个URL重定向.

其它的返回码只可以带text

单独retrun URL是指302


### rewrite

> Syntax:rewrite regex replacement [flag];
> Default:—
> Context:server, location, if

rewrite指令按顺序执行, 但可以用flag参数打断它. 如果replacement以“http://”, “https://”, or “$scheme”打头, 直接返回用户一个重定向. 毕竟host已经变掉了.

flag的选项有

- last 不再继续执行current set of rewrite指令, 开始用新的URI匹配location
- break 不再继续执行current set of rewrite指令, 但并不去匹配location, 参考break指令.
- redirect 如果replacement不以“http://”, “https://”, or “$scheme”打头, 返回302
- permanent 返回301

## 举例 官方例子

```
server {
    ...
    rewrite ^(/download/.*)/media/(.*)\..*$ $1/mp3/$2.mp3 last;
    rewrite ^(/download/.*)/audio/(.*)\..*$ $1/mp3/$2.ra  last;
    return  403;
    ...
}
```

用户请求的URI会依次执行这两个rewrite指令, 如果有一个成功, 则终止(last), 如果没有成功的, 则返回403

但是如果这些指令在location里面, 则要用break, 否则nginx会循环10次然后返回500.

```
location /download/ {
    rewrite ^(/download/.*)/media/(.*)\..*$ $1/mp3/$2.mp3 break;
    rewrite ^(/download/.*)/audio/(.*)\..*$ $1/mp3/$2.ra  break;
    return  403;
}
```

**注意**  这是官网的例子和说明, 实际上这个例子不会触发500, 因为last之后第二次执行rewrite的时候不会执行成功.

## 其它两点要注意的

1. 如果replacement带了新的参数, 之前的参数也会同时加进来. 如果不想带原有的参数, 需要replacement*最后面*加一个问号.

    rewrite ^/users/(.*)$ /show?user=$1? last;

2. 如果正则包含“}” or “;”, 需要用单引号引起来

## 更多例子

### last在location中

/name/childe匹配到第二个Location, 因为last继续匹配, 匹配到第3个location, 所以代理到remote2路径.

```
server {
    listen 8080;
    server_name rewrite-test-1.localhost;

    location /name/ {
        proxy_pass http://127.0.0.1:8000/remote/;
    }

    location = /name/childe {
        rewrite ^/name/(.*) /id?id=$1 last;
        proxy_pass http://127.0.0.1:8000/remote1/;
    }

    location /id {
        proxy_pass http://127.0.0.1:8000/remote2/;
    }
}

curl rewrite-test-1.localhost:8080/name/childe
127.0.0.1 - - [13/Jun/2017 13:37:12] "GET /remote2/?id=childe HTTP/1.0" 404 -
```

### break在location中

/name/childe匹配到第二个Location, 因为break停止继续匹配, 继续执行下面的指令(proxy_pass). 因为有rewrite, 所以proxy_pass中的URI其实是失效的. 这一点参考前一篇[nginx的路径变化](http://ohmycat.me/2017/06/12/nginx-uri-change.html)

```
server {
    listen 8080;
    server_name rewrite-test-2.localhost;

    location /name/ {
        proxy_pass http://127.0.0.1:8000/remote/;
    }

    location = /name/childe {
        rewrite ^/name/(.*) /id?id=$1 break;
        proxy_pass http://127.0.0.1:8000/remote1/;
    }

    location /id {
        proxy_pass http://127.0.0.1:8000/remote2/;
    }
}
curl rewrite-test-2.localhost:8080/name/childe
127.0.0.1 - - [13/Jun/2017 13:40:15] "GET /id?id=childe HTTP/1.0" 404 -
```

### replacement以http://打头

直接返回302

```
server {
    listen 8080;
    server_name rewrite-test-3.localhost;

    location = /name/childe {
        rewrite ^/name/(.*) http://rewrite-test-1.localhost:8080/id?id=$1;
        proxy_pass http://127.0.0.1:8000;
    }
}

% curl -i http://rewrite-test-3.localhost:8080/name/childe
HTTP/1.1 302 Moved Temporarily
Server: nginx/1.10.2
Date: Tue, 13 Jun 2017 05:43:16 GMT
Content-Type: text/html
Content-Length: 161
Connection: keep-alive
Location: http://rewrite-test-1.localhost:8080/id?id=childe
```

### redirect和permanent

```
server {
    listen 8080;
    server_name rewrite-test-4.localhost;

    location = /name/childe {
        rewrite ^/name/(.*) http://rewrite-test-1.localhost:8080/id?id=$1 redirect;
        proxy_pass http://127.0.0.1:8000;
    }
}

server {
    listen 8080;
    server_name rewrite-test-5.localhost;

    location = /name/childe {
        rewrite ^/name/(.*) http://rewrite-test-1.localhost:8080/id?id=$1 permanent;
        proxy_pass http://127.0.0.1:8000;
    }
}
```

### 顺序执行

```
server {
    listen 8080;
    server_name rewrite-test-6.localhost;

    location /download/ {
        rewrite ^(/download/.*)/media/(.*)\..*$ $1/mp3/$2.mp3 break;
        rewrite ^(/download/.*)/audio/(.*)\..*$ $1/mp3/$2.ra  break;
        return 403;
        proxy_pass http://127.0.0.1:8000;
    }
}
```

- 匹配第一个rewrite指令, 略过其它指令, 执行后面的proxy_pass

        curl -i http://rewrite-test-6.localhost:8080/download/test/media/abcd.avi
        127.0.0.1 - - [13/Jun/2017 13:47:35] "GET /download/test/mp3/abcd.mp3 HTTP/1.0" 404 -

- 未能匹配, 执行return 403

        % curl -i http://rewrite-test-6.localhost:8080/download/test/abcd.avi
        HTTP/1.1 403 Forbidden
        Server: nginx/1.10.2
        Date: Tue, 13 Jun 2017 05:47:48 GMT
        Content-Type: text/html
        Content-Length: 169
        Connection: keep-alive

### 最后来个死循环

```
server {
    listen 8080;
    server_name rewrite-test-7.localhost;
    rewrite_log on;

    location /download/ {
        rewrite ^/download/media/(.*)\..*$ /download/media/$1.mp3 last;
        rewrite ^/download/audio/(.*)\..*$ /download/audio/$1.ra  last;
        return 403;
    }
}

% curl -i http://rewrite-test-7.localhost:8080/download/media/abcd.avi
HTTP/1.1 500 Internal Server Error
Server: nginx/1.10.2
Date: Tue, 13 Jun 2017 05:52:31 GMT
Content-Type: text/html
Content-Length: 193
Connection: close
```
