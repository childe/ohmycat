---
layout: post
title:  "kibana4打包和安装"
date:   2014-12-13 23:08:22 +0800
modifydate:   2014-12-13 23:08:22 +0800
abstract:   "对于Kibana4,官方只提供了一个打包好的JAVA的包. 如果想自己修改一些代码添加一些自定义功能, impossible. 至少我还是希望能像Kibana3一样,就是一普通的hmlt静态网站,放在nginx下面跑. 可以添加一些自己的panel. 好吧, 虽然Kibana4好像已经不需要添加什么panel了,但改改css, html总行吧. 而且还可以利用nginx做一些权限控制什么的.<br>
虽然github有源码了,但做为一个新手, 对于grunt这些东西只是有最最最基本的一些了解,还是折腾了一会才搞定. 纪录一下."
categories: elasticsearch
---

对于Kibana4,官方只提供了一个打包好的JAVA的包. 如果想自己修改一些代码添加一些自定义功能, impossible. 至少我还是希望能像Kibana3一样,就是一普通的hmlt静态网站,放在nginx下面跑. 可以添加一些自己的panel. 好吧, 虽然Kibana4好像已经不需要添加什么panel了,但改改css, html总行吧. 而且还可以利用nginx做一些权限控制什么的.

虽然github有源码了,但做为一个新手, 对于grunt这些东西只是有最最最基本的一些了解,还是折腾了一会才搞定. 纪录一下.

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
    不知道为什么, k4没有像k3一样给一个config example. 以至于根本跑不起来,会报找不到config的错误. (可能是第7步里面build时下载Jruby做一个webserver之后会生成config.yaml文件吧, 反正我是ctrl+c了, 没看到)  
    送大家一份config, 放在src/kibana下面就好. 拿走不谢.

    ```
    {
        "request_timeout": 60,
        "kibanaIndex": ".kibana",
        "bundledPluginIds": [
            "plugins/dashboard/index",
            "plugins/discover/index",
            "plugins/settings/index",
            "plugins/table_vis/index",
            "plugins/vis_types/index",
            "plugins/visualize/index"
        ],
        "defaultAppId": "discover",
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
      configFile.elasticsearch = (
        window.location.protocol + '//' +
        window.location.hostname +
        (window.location.port ? ':' + window.location.port : '') +
        '/elasticsearch');
    ```
    最重要的elasticsearch的配置, 居然不是放在配置文件里, 而是写在代码里面了. 这里改成真正的elasticsearch的地址就可以了. 我觉得也是用jruby跑web service时做了配置+映射之类吧. 不管了.

OVER.
