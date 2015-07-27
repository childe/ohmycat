---
layout: post
title:  "kibana4打包和安装"
date:   2014-12-13 23:08:22 +0800
modifydate:   2015-01-13 19:14:14 +0800
abstract:   "对于Kibana4,官方只提供了一个打包好的应用, 是用nodejs做服务器,功能很简单朴素, 基本上就是对静态页面做了一个窗口, 还有些中间件做日志记录等.<br>
直接拿来用已经很方便了. 我写这篇记录的时候, 官方的发布包还是打包成一个java文件, 那个时候真的很不友好. 所以我折腾了一下, 把前端放在了nginx下面<br>
虽然github有源码了,但做为一个新手, 对于grunt这些东西只是有最最最基本的一些了解,还是折腾了一会才搞定. 纪录一下."
categories: elasticsearch
---

对于Kibana4,官方只提供了一个打包好的JAVA的包(现在已经是用nodejs了,使用很方便,修改源码也很方便,所以后面这些话忽略吧). 如果想自己修改一些代码添加一些自定义功能, impossible. 至少我还是希望能像Kibana3一样,就是一普通的hmlt静态网站,放在nginx下面跑. 可以添加一些自己的panel. 好吧, 虽然Kibana4好像已经不需要添加什么panel了,但改改css, html总行吧. 而且还可以利用nginx做一些权限控制什么的.

虽然github有源码了,但做为一个新手, 对于grunt这些东西只是有最最最基本的一些了解,还是折腾了一会才搞定. 纪录一下.

**以下操作都是基于8cef836c61b5749164156e19accb2a0881e902e4这个commit**

1. 从github下载kibana4代码.

    ```sh
    git clone git@github.com:elasticsearch/kibana.git
    ```

2. 默认你已经有node了, 如果没有, 用apt-get 或者 yum 或者brew等工具装上. 然后先把bower grunt装好, 接下来就要用.

    ```sh
    npm install -g bower grunt-cli
    ```

3. 进入kibana目录. 我没有在master分支, 我是切换到了v4.0.0-beta2分支上面.

    ```sh
    cd kibana
    git checkout v4.0.0-beta2
    ```

4. 安装需要的npm包.  

    其实, 我不确定是不是所有的包都要装, 我只是要用grunt build一下.甚至只是生成css文件而已.  
    这里要注意, 如果是用官方源, 而你身在大陆的话, 那就等死吧.
    [淘宝源在此](https://cnodejs.org/topic/4f9904f9407edba21468f31e)

    ```sh
    npm install
```

5. bower install

    安装需要的js css包. 从github下载. 对于大陆电信30M用户来说, 也是极其痛苦, 一个400K的包死活就是下载不下来.  
    osx系统的bower cache文件夹好像在这里/private/var/folders/j9/37cyszz92cg1xkfc46cl5w5r0000gn/T/yourusername/bower
    浏览器明明能下载下来, bower就是死活不行. 没办法, 先用浏览器下载之后放在cache文件夹里面

    ```sh
    bower install
    ```

6. grunt
    可以看到默认是跑了两个任务.
    > grunt.registerTask('default', ['jshint:source', 'less']);
    less生成css文件. jshint大概就是检查一下JS语法错误吧.

    ```sh
    grunt
    ```

7. grunt build

    其实生成css之后, 把src/kibana放在nginx下面就可以跑了.   
    build嘛, 就是把一些文件合并压缩一下, 加速用户访问吧. 但Kibana这个项目里面, 实测下来好像没有做什么, 就直接copy了一份到build目录了. 而且还会下载jruby等做服务器. 还是建议大家算了吧.

8. config 配置.

    grunt之后, 会在目录下生成一个config文件, 这是一个json文件, 里面是kibana4的一些配置. 里面的kibanaIndex需要改成kibana_index这种格式. 这个生成的原始配置文件应该是nodejs用的, nodejs应该会转成kibana_index这种格式, 但我们现在不用Nodejs做后端服务器了, 所以需要用工改一下.

    ```
    {
        "request_timeout": 60,
        "kibana_index": ".kibana",
        "bundled_plugin_ids": [
            "plugins/dashboard/index",
            "plugins/discover/index",
            "plugins/settings/index",
            "plugins/table_vis/index",
            "plugins/vis_types/index",
            "plugins/visualize/index"
        ],
        "default_app_id": "discover",
        "host": "0.0.0.0",
        "shard_timeout": 30000,
        "plugins": [
            "plugins/dashboard/index",
            "plugins/discover/index",
            "plugins/settings/index",
            "plugins/table_vis/index",
            "plugins/vis_types/index",
            "plugins/visualize/index"
        ],
        "port": 5601,
        "verifySSL": false
    }
    ```

9. 还差一点点了.

    到这里...居然还不行...  
    打开components/config/config.js, 可以看到:

    ```js
     var configFile = JSON.parse(require('text!config'));
     configFile.elasticsearch = (function () {
       var a = document.createElement('a');
       a.href = 'elasticsearch';
       return a.href;
     }());
    ```
    最重要的elasticsearch的配置, 不是放在配置文件里, 而是写在代码里面了. 这里改成真正的elasticsearch的地址就可以了. 

10. k4要求ES版本至少也是1.4. 但其实1.3版本的也可以正常使用. 我们就是1.3. 暂时也没打算升级. 限制的代码在index.js里面, 改成```constant('minimumElasticsearchVersion', '1.3.0')```就OK了.

OVER.


# 补充 (曾经的某个版本下还需要):

1. script_fileds

    安全起见, 我们的ES禁用script. 

    但是k4有些请求, 至少在找index pattern的时候, 使用了script_fileds.

    我简单粗暴的把components/courier/data_source/_abstract.js里面带script_fileds的代码注释了...  
    目前还没有发现副作用, 先这样用吧.

2. 要设置一个默认index pattern

    新建index pattern之后, 要设置一个为默认. 否则k4有些2去找名叫.kibana这个index pattern, 当然找不到, 就报错了.  
    beta2还没这个要求.  
    我也不是完全确认就是这个原因造成的, 但的确设置一个默认之后就好了.
