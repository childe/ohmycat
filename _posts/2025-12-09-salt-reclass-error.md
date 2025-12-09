---

date: 2025-12-09T10:41:22+0800
title: 'salt state.sls遇到reclass错误'
layout: post

---

以下都是AI的总结，根据我和AI之间的对话生成的。Gemini 模型。

但是总结的不好，没有正确的复现“我们”的排查过程。

[故障复盘] SaltStack Reclass 从“节点冲突”到“幽灵报错”的排查实录

日期: 2025-12-08 环境: SaltStack + Reclass (ext_pillar) 核心问题: 新增/管理节点时出现 Pillar 渲染失败，报错信息误导性强。

# 阶段一：初遇“节点冲突” (Collision)

1. 故障现象

在执行 Salt 命令时，报错提示 Pillar 渲染失败，原因是由于 Reclass 检测到同一个节点 ID (SVR22753HW1288) 定义了两次（冲突）。

```
# salt SVR21793HW1288 state.sls npd
...
Failed to load ext_pillar reclass: Definition of node 'SVR22753HW1288' ... collides with definition in ...
```

2. 排查过程
动作: 检查文件系统，寻找重复文件。

```
find /srv/reclass/nodes -name "SVR22753HW1288.yml"
```

现象: find 命令无结果，或者只显示一个文件。文件系统层面上并不存在物理冲突。

Salt Master 日志: 出现 ERROR: 'list' object has no attribute 'items'。

分析: 这是一个“幽灵冲突”。很可能是文件已被删除，但 Salt Master 的内存/缓存中仍保留旧的索引，或者是之前的软链接导致的递归扫描。

3. 初步处理
结论: 需要强制刷新 Master 状态。如果文件确实删除了，重启服务应能解决冲突报错。

# 阶段二：报错突变 —— “找不到节点” (Node not found)

1. 故障现象

在清理了环境并尝试操作目标节点 SVR21793HW1288 后，冲突报错消失，但出现了新错误：

Failed to load ext_pillar reclass: ext_pillar.reclass: Node 'SVR21793HW1288' not found under yaml_fs:///srv/reclass/nodes

2. 排查过程

动作: 手工创建该节点文件 SVR21793HW1288.yml。

现象: 报错依旧。

关键测试: 在 Minion 端执行 salt-call --local state.sls npd 成功，但在 Master 端执行 salt 命令 失败。

这表明文件物理存在，且内容逻辑大概率没问题（Minion 能读），但 Master 进程“看不见”它。

深入检查:

检查 Minion ID 与文件名是否匹配：✅ 匹配。

检查权限：✅ 正常。

检查文件内容：


cat -A /srv/reclass/nodes/prod-client/muise/SVR21793HW1288.yml

发现: cat -A 无输出。文件是空的（0字节）！

修正: 填入 YAML 内容。

结果: 依然报错 Node not found！这非常反直觉。

# 阶段三：真相大白 —— 公共文件语法错误

1. 深度诊断

既然文件存在、有内容、有权限，且 Minion 本地能跑通，说明问题出在 Master 端 Reclass 加载器的全局状态。

动作: 绕过 Salt，直接使用 Reclass CLI 工具诊断。

Bash

reclass --inventory
现象: Reclass CLI 抛出了巨长的 Traceback 报错：

Plaintext

yaml.parser.ParserError: while parsing a block mapping
  in "/srv/reclass/classes/client/ssm.yml", line 17, column 9
did not find expected key

2. 根本原因 (Root Cause)

问题根本不在新节点 SVR21793HW1288 上。

问题出在一个 公共 Class 文件 (/srv/reclass/classes/client/ssm.yml) 存在 YAML 语法错误（缩进/冒号缺失）。

连锁反应:

Salt Master 启动或重新加载 Pillar 时，Reclass 尝试构建全局 Inventory。

读到 client/ssm.yml 时，解析器崩溃 (Crash)。

Reclass 无法完成索引构建。

当查询 任何 节点时，Reclass 返回“未找到”或直接抛出异常，导致 Salt 认为节点不存在。

# 最终解决方案

修复语法错误: 编辑 /srv/reclass/classes/client/ssm.yml，修正第 17-18 行的缩进错误。

验证修复: 再次运行 reclass --inventory | grep SVR21793HW1288，确认能输出节点信息。

彻底刷新 Master (SOP): 修复配置后，必须执行以下三步，缺一不可：


```
# 1. 重启 Master (清除内存中的错误状态)

systemctl restart salt-master

# 2. 清除 Pillar 缓存 (防止读取旧的错误缓存)

salt-run pillar.clear_pillar_cache

# 3. 刷新 Minion 状态

salt SVR21793HW1288 saltutil.refresh_pillar
```

测试:


salt SVR21793HW1288 state.sls npd

结果: 成功！

# 经验总结 (SOP)

在 master 运行

```
reclass --inventory # 检查并修复存在的问题

# 清除 Pillar 缓存 (防止读取旧的错误缓存)
salt-run pillar.clear_pillar_cache

# 刷新 Minion 状态
salt SVR21793HW1288 saltutil.refresh_pillar

# 重启 Master (清除内存中的错误状态)
systemctl restart salt-master
```

## 下面是AI给的总结，我觉得总结的不好：

以后遇到类似 Reclass 诡异报错 的标准排查流程：

隔离测试:

先跑 salt-call --local ...。如果 Minion 本地成功，但 Master 失败，说明是 Master 端环境/缓存/全局文件的问题。

直接诊断 (关键一步):

不要猜，直接在 Master 运行 reclass --inventory。

如果它报错 ParserError，直接修那个报错的文件（通常是公共 Class）。

检查“低级”错误:

文件是否为空？(ls -l)

是否用了 Tab 键？(cat -A)

文件名有没有空格？

黄金法则:

修改了公共 Class 文件后，必须重启 salt-master。

不要相信 Master 会自动从严重的 Reclass 崩溃中恢复。
