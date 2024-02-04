---

date: 2024-02-03T17:01:23+0800
title: "python black 格式化相关的一个问题"
layout: post

---

如实做一个记录。

我写 Python 脚本使用 neovim + coc。lsp 使用 pyright。使用 black 做格式化。配置了保存时自动格式化。

但是 black 不能 sort import。

coc-python 支持 sort import，可以用户自己配置使用 pright，还是 isort。我使用的是 pyright。

但我没找到 coc-python 里面怎么配置保存时自动 sort import。所以我在 vim 配置里面添加了一行： `autocmd BufWritePre *.py :silent call CocAction('runCommand', 'editor.action.organizeImport')`

以上是前提。用了一段时间在代码格式化这块都工作良好，直到今天。


项目中有些参数，我使用了环境变量来做配置。今天我在项目中使用 [dotenv](https://pypi.org/project/python-dotenv/) 来加载自己配置的环境变量。

```
- main.py
- utils
  - common.py
```

项目结构大概如上这样。common.py 里面有些参数从环境变量上加载。我在 main.py 里面调用 `load_dotenv`。但这时候已经晚了，因为 main.py import utils.commond 在 `load_dotenv` 之前，这时候已经把环境变量的值取到了，还不是 load_dotenv 的内容。

解决方法当然很简单，就是 main.py 里面把 `from dotenv import load_dotenv; load_dotenv()` 放最前面。但麻烦的事情来了：保存的时候 load_dotenv 被格式化到了所有 import 后面！


中间查解决方案的过程比较长，说一下有些折腾的原因：

black 本身可以使用 `#fmt: off  #fmt: on` 这样的语法让一段代码不被格式化。
**但是**，pyright sort import 的时候并不认 black 的语法，而且它没有自己的类似这样 skip format 的功能。

最后我还是在 coc-python 里面换成了使用 isort 来做 sort import。

isort 的配置里面，添加 `profile=black` 配置可以了，这样 black 和 isort 都会认 fmt:off 这样的语法了。

我的 isort 安装在了 `/.vim/isort/bin/isort` ，isort 配置也放在这里。

```bash
# cat ~/.vim/isort/.isort.cfg
[settings]
profile=black
```

main.py 代码就像下面这样

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# fmt: off
from dotenv import load_dotenv

load_dotenv()
# fmt: on

import argparse
import json
```
