---
layout: post
title:  "different formatter depends on logging level"
date:   2015-03-06 09:38:16 +0800
modifydate:   2015-03-06 09:38:16 +0800
abstract:   "Python中记录日志的时候, 希望不同level的日志使用不同的format, 比如INFO以上级别的, 就简单记录一下msg, DEBUG的还要记录一下文件名, 函数名, 行号等信息.<br><br>
但是翻阅了一下官方文档, 以及搜索了不少资料, 都没能简单的找到答案, 最后一点点线索拼凑出来了我需要的效果.
"
categories: python
---

```py
#!/usr/bin/env python
# -*- coding: utf-8 -*-

import logging
import logging.handlers
import logging.config


def initlog(level=None):

    if level is None:
        level = logging.DEBUG if __debug__ else logging.INFO

    class MyFormatter(logging.Formatter):

        def format(self, record):
            dformatter = '%(levelname)s: [%(asctime)s] - %(pathname)s %(lineno)d - %(message)s'
            formatter = '%(levelname)s: [%(asctime)s] - %(message)s'
            if record.levelno <= logging.DEBUG:
                self._fmt = dformatter
            else:
                self._fmt = formatter
            return super(MyFormatter, self).format(record)

    config = {
        "version": 1,
        "disable_existing_loggers": True,
        "formatters": {
            "custom": {
                '()': MyFormatter,
            },
            "simple": {
                "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
            },
            "verbose": {
                "format": "%(asctime)s - %(levelname)s - %(module)s %(lineno)d - %(message)s"
            }
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "level": "DEBUG",
                "formatter": "custom",
                "stream": "ext://sys.stdout"
            },
            "file_handler": {
                "class": "logging.handlers.RotatingFileHandler",
                "level": "DEBUG",
                "formatter": "custom",
                "filename": "app.log",
                "maxBytes": 10*1000**3,  # 10M
                "backupCount": 5,
                "encoding": "utf8"
            }
        },
        'root': {
            'level': level,
            'handlers': ['console']
        },
        "loggers": {
            "myloger": {
                "level": level,
                "handlers": [
                    "file_handler"
                ],
            }
        },
    }
    logging.config.dictConfig(config)


def main():
    initlog()
    logging.debug("debug") # write to console
    logger = logging.getLogger("myloger")
    logger.debug("debug") # write to console and file
    logger.error("error") # write to console and file

if __name__ == '__main__':
    main()
```


如果需要传自定义参数到MyFormatter里面, 可参考

```py
    class MyFormatter(logging.Formatter):

        def __init__(self, args):
            super(MyFormatter, self).__init__()
            print args

        def format(self, record):
            dformatter = '%(levelname)s: [%(asctime)s] - %(pathname)s %(lineno)d - %(message)s'
            formatter = '%(levelname)s: [%(asctime)s] - %(message)s'
            if record.levelno <= logging.DEBUG:
                self._fmt = dformatter
            else:
                self._fmt = formatter
            return super(MyFormatter, self).format(record)

        ....

        "formatters": {
            "custom": {
                '()': MyFormatter,
                'args': 1
            },

        ....
```
