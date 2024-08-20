---

date: 2024-08-20T16:17:47+0800
title: 使用nginx和vouch-proxy做OIDC登陆和权限控制
layout: post

---

# 需求

我做了一个前后端分享的网页（前端使用vuejs3，后端使用 golang）

但我需要一个权限控制的功能，以保证某些“危险的”操作只能特定的人有权限操作。这些危险的操作我定义为POST PUT DELETE 等方法。

要做权限控制，首先需要有用户的信息，最好是和公司的 Ldap 结合的。

我不想从头实现这样的功能，想仅仅通过已有第三方的组件，简单的配置就可以实现。另外，我们公司有 OIDC 服务，所以优先选择能使用 OIDC 的组件。

以上就是我的需求。

# OIDC

选择了使用 vouch-proxy 和 nginx 来做这个事情。（因为公司有OIDC服务了，如果没有，可能需要自己搭建）

## 申请 OIDC Client

申请之后，拿到 clientid 和 clientsecret，这两个需要配置在 vouch 的 config 里面（最后有示例）。

申请的时候，需要提交 callback 地址信息，这个地址需要配置在 vouch config 文件中，最好一点都不能错，包括 schema 和 最后的 `/` 。有些 OIDC 服务在这方便比较严格。

OIDC 服务提供方还会返回一个 odic 服务的地址，比如 https://oidc.corp.com。

但 vouch 需要同时配置 `token_url` 和 `user_info_url` 。 如果 OIDC 服务提供方没有给这两个地址，可以自己通过 `https://oidc.corp.com/.well-known/openid-configuration` 获取。（有些 OIDC 组件会自己去这个地址获取，不用用户自己配置）

## 域名准备

我们自己的页面叫 app.corp.com

再给 vouch 服务一个域名，vouch.app.corp.com

注意两点：
1. 他们应该是同一个父域名，方便设置 cookie
2. 只用一个域名可能也行，在 nginx 里面配置一下。我没有尝试，这里也不讨论了。

## OIDC 原理

结合 vouch-proxy 说一下 OIDC 原理，知道了原理，以后有问题才好处理。

OIDC 并没有单点登陆的功能。所以原理里面并不会包括单点登陆的东西。

1. 访问一个页面时，nginx 通过 auth_request 将请求交给 vouch 做权限控制。但注意这里的*权限控制*，我不知道应该叫什么更确切，不是看用户有没有特定的权限做特定的操作，在这个场景下，可以理解成只是看用户是不是登陆了。如果读者对 nginx auth_request 模块不了解，需要先去做个简单了解，这里不做解释了。

2. vouch 根据 cookie 来判断用户是不是已经登陆了，以及用户名等等信息。这里的 Cookie 怎么来的呢，我们后面会说到。

3. 第一次访问的时候，肯定没有这个Cookie，vouch 根据 auth_request 的协议返回 401。nginx 通过 auth_request 模块，知道用户没有登陆，就会 302 跳转到一个登陆页面，在这里，我们是配置成 302 到 vouch.app.corp.com/login

4. vouch 的 login handler 会根据 OIDC 的配置，跳转到 OIDC 登陆页面。

5. OIDC 登陆之后，会根据 redirect_url 跳回 vouch 的 vouch.corp.com/auth，OIDC 跳回这里的时候，会带上一个 code 参数

6. vouch 拿 code 参数去请求 OIDC 服务，如果 code 合法，则返回用户信息。

7. auth handler 拿到用户信息之后，会set-cookie，将 token（是一串加密信息）设置到 app.corp.com domain 中。

8. 用户再次打开 app.corp.com 时，同步骤1 一样将请求交给 vouch 做判断是否有权限。

9. vouch 通过 cookie 中的 token 拿到用户信息，直接返回 200，通过。

10. nginx 中通过 auth_request_set 配置，将用户名传递给 proxy_pass，以做其他用途。目前我这里还没有用到，后面的权限控制会用到。

OIDC 在这里就 OK 了，用户需要登陆才能使用 app.corp.com 了。

# 权限控制

这块是纯粹在 nginx 配置的，因为通过 auth_request_set，我们在 nginx 中已经可以获取用户名。但这块也非常折腾，主要还是 nginx 的指令实在是不符合代码的正常思维（个人感受）。可能用 OpenResty 更好。

这块不多说了，拿两个尝试的失败的方案说一下。最后给出目前的可以工作的配置。

1. 最简单的想法是使用 if 指令，但是 if 指令不管写在配置的什么位置，都会在 auth_request 之前执行，导致拿不到用户信息。关于这个问题，有用户给出了详细的问题描述和尝试。[https://serverfault.com/questions/1121736/nginx-is-not-handling-auth-request-before-if-statement](https://serverfault.com/questions/1121736/nginx-is-not-handling-auth-request-before-if-statement)。我也是在这个帖子的回复中找到进一步尝试的方法。

2. 根据问题1 中下面某人的回复，我尝试使用 map 来做这件事。但还是失败了。失败的原因很奇怪，如果使用变量名做 proxy_pass 的后端，则url 会被全部截断传到后端，完全无法正常工作。我没有找到相关的官方文档，所以自己瞎尝试了几种配置，都失败了。最后还是放弃了这个看似美好而且配置相对简单的方案。

3. 一度想在 vouch 里面来做这个事，后面发现不合适。因为 vouch 返回 401 的话，会再次去 OIDC 登陆，用户会迷茫，明明已经登陆过了啊，死循环了。所以在 vouch 中做这个事不合适。

# 配置

nginx 配置
```
upstream healer {
    server 127.0.0.1:8001;
}

server {
   listen 8001;

   set $allow 0;

   if ($request_method = GET) {
     set $allow 1;
   }
   if ($request_method = HEAD) {
     set $allow 1;
   }
   if ($request_method = OPTIONS) {
     set $allow 1;
   }
   if ($http_x_vouch_user = "zhangsan" ) {
     set $allow 1;
   }
   if ($http_x_vouch_user = "lisi" ) {
     set $allow 1;
   }

   if ($allow = 0) {
     return 403;
   }

   location / {
        proxy_pass http://127.0.0.1:8000;
   }
}

server {
    listen       8080 default_server;
    server_name  app.corp.com;

    auth_request /validate;
    location = /validate {
        # forward the /validate request to Vouch Proxy
        proxy_pass http://127.0.0.1:9090/validate;

        # be sure to pass the original host header
        proxy_set_header Host $http_host;

        # Vouch Proxy only acts on the request headers
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";

        # optionally add X-Vouch-User as returned by Vouch Proxy along with the request
        auth_request_set $auth_resp_x_vouch_user $upstream_http_x_vouch_user;

        # these return values are used by the @error401 call
        auth_request_set $auth_resp_jwt $upstream_http_x_vouch_jwt;
        auth_request_set $auth_resp_err $upstream_http_x_vouch_err;
        auth_request_set $auth_resp_failcount $upstream_http_x_vouch_failcount;
    }

    error_page 401 = @error401;
    location @error401 {
      return 302 http://vouch.app.corp.com/login?url=$scheme://$http_host$request_uri&vouch-failcount=$auth_resp_failcount&X-Vouch-Token=$auth_resp_jwt&error=$auth_resp_err;

    }

    location / {
        if ($http_user_agent ~* HealthChecker) {
            return 200;
        }
        if ($http_user_agent ~* kube-probe) {
            return 200;
        }

        root   /opt/kafka-admin/;

        auth_request_set $auth_resp_x_vouch_user $upstream_http_x_vouch_user;
        auth_request_set $auth_resp_x_vouch_idp_claims_groups $upstream_http_x_vouch_idp_claims_groups;
        auth_request_set $auth_resp_x_vouch_idp_claims_given_name $upstream_http_x_vouch_idp_claims_given_name;
    }

    location /api/ {
        auth_request_set $auth_resp_x_vouch_user $upstream_http_x_vouch_user;
        auth_request_set $auth_resp_x_vouch_idp_claims_groups $upstream_http_x_vouch_idp_claims_groups;
        auth_request_set $auth_resp_x_vouch_idp_claims_given_name $upstream_http_x_vouch_idp_claims_given_name;

        # used in map
        auth_request_set $vouch_user $upstream_http_x_vouch_user;

        proxy_pass http://healer/;
        proxy_set_header X-Vouch-User $auth_resp_x_vouch_user;
    }


    #error_page  404              /404.html;

    # redirect server error pages to the static page /50x.html
    #
    error_page   500 502 503 504  /50x.html;
    location = /50x.html {
        root   /usr/share/nginx/html;
    }

    # proxy the PHP scripts to Apache listening on 127.0.0.1:80
    #
    #location ~ \.php$ {
    #    proxy_pass   http://127.0.0.1;
    #}

    # pass the PHP scripts to FastCGI server listening on 127.0.0.1:9000
    #
    #location ~ \.php$ {
    #    root           html;
    #    fastcgi_pass   127.0.0.1:9000;
    #    fastcgi_index  index.php;
    #    fastcgi_param  SCRIPT_FILENAME  /scripts$fastcgi_script_name;
    #    include        fastcgi_params;
    #}

    # deny access to .htaccess files, if Apache's document root
    # concurs with nginx's one
    #
    #location ~ /\.ht {
    #    deny  all;
    #}
}

server {
    listen 8080 ;
    server_name vouch.app.corp.com;
    location / {
        proxy_pass http://127.0.0.1:9090;
        # be sure to pass the original host header
        proxy_set_header Host vouch.app.corp.com;
    }
}
```

vouch oidc

```yaml
vouch:
  session: # 如果是多机器部署在一个 LB 后面，session.key 需要一样。这里不配置就会随机生成，导致认证失败。
    key: 4LjeTY9/E17RvQx1itF0p6CsfFuqhgQiNtVQQGh32is=

  #whitelist:
    #- rmself
    #- childe

  #allowAllUsers: true

  domains:
  - corp.com # 会用来验证 OIDC 返回的 email 是不是在此 domains 里面，如果不在会401。
  cookie:
    secure: false
    # vouch.cookie.domain must be set when enabling allowAllUsers
    domain: app.corp.com

oauth:
  # Generic OpenID Connect
  provider: oidc
  client_id: xxxxxx
  client_secret: xxxxxx
  auth_url: https://oidc.corp.com/authorize
  token_url: https://oidc.corp.com/token
  user_info_url: https://oidc.corp.com/userinfo
  scopes:
    - openid
    - email
    - profile
  callback_url: http://vouch.oidc.corp.com/auth
```
