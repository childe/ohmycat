---

title: nginx配置中的if条件与querystring配置例子
date: 2018-09-27T17:02:04+0800
layout: post

---


    set $search 0;
    if ($request_uri ~ "_search"){
        set $search 1;
    }
    if ($request_uri ~ "_count"){
        set $search 1;
    }

    if ($arg_ignore_unavailable = true) {
        set $search "${search}1";
    }
    if ($search = 1) {
        set $args $args&ignore_unavailable=true;
    }


    if ($arg_preference = "") {
        set $args $args&preference=$upstream_http_django_user;
    }
