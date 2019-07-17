---

title: 虚拟一个 Mysql 给 Django 用
date: 2019-07-17T14:37:22+0800
layout: post

---

我想通过 Model 生成建表的 Sql, 但是一定要有一个可用的 Mysql 才行, 觉得很麻烦. 于是找到了这个项目.

https://pypi.org/project/django-fake-database-backends/

安装:

  pip install django-fake-database-backends


配置:

```
DATABASES = {
    'default': {
        'ENGINE': 'django_fake_database_backends.backends.mysql',
    }
}
```
