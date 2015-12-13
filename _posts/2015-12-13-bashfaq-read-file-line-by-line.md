---
layout: post
title:  "如何按行或者按列读取文件/数据流/变量"
date:   2015-12-13 16:48:50 +0800
abstract:   "翻译自http://mywiki.wooledge.org/BashFAQ/001"
categories: bash linux
---

翻译自[http://mywiki.wooledge.org/BashFAQ/001](http://mywiki.wooledge.org/BashFAQ/001)

[不要使用for](). 要使用while循环和read来实现.

    while IFS= read -r line; do
        printf '%s\n' "$line"
    done < "$file"

read后面的-r选项可以阻止\转义, 如果不用-r, 单独的\会被忽略. 使用read的时候, 几乎一定要跟着-r.

看一下例子吧,先是用-r

    % cat 01.sh
    file="01.sh"
    while IFS= read -r line; do
        printf '%s\n' "$line"
    done < "$file"

    % sh 01.sh
    file="01.sh"
    while IFS= read -r line; do
        printf '%s\n' "$line"
    done < "$file"

把-r去掉看一下

    % cat 01.sh
    file="01.sh"
    while IFS= read line; do
        printf '%s\n' "$line"
    done < "$file"

    % sh 01.sh
    file="01.sh"
    while IFS= read line; do
        printf '%sn' "$line"
    done < "$file"

IFS= 是为了避免[把前后的空格去掉](), 如果你就是想把前后空格去掉, 就不要用IFS= 了.

**IFS是一个很有意思的东西,再多一些了解之后,会记录一下.**

line是一个变量名, 随便你叫什么,可以用任何在shell中合法的变量名

重定向符号 < "$file" , 告诉while循环从file这个文件中读取内容. 也可以不用变量, 就直接用一个字符串.  像 < 01.sh.

如果数据源就是标准输入,就不用任何重定向了. (ctrl+D)结束.

如果输入源是变量或者参数中的内容,bash可以用 <<< 遍历数据 (原文中把它叫做here string)

    while IFS= read -r line; do
      printf '%s\n' "$line"
    done <<< "$var"

也可以用 << (原文中把它叫做here document)

    while IFS= read -r line; do
      printf '%s\n' "$line"
    done <<EOF
    $var
    EOF

如果想把#开头的过滤掉, 可以在循环中直接跳过, 如下

    # Bash
    while read -r line; do
      [[ $line = \#* ]] && continue
      printf '%s\n' "$line"
    done < "$file"

如果想对每一列单独处理, 可以在read后用多个变量

    # Input file has 3 columns separated by white space (space or tab characters only).
    while read -r first_name last_name phone; do
      # Only print the last name (second column)
      printf '%s\n' "$last_name"
    done < "$file"

如果分隔符不是空白符, 可以设置IFS, 如下:

    # Extract the username and its shell from /etc/passwd:
    while IFS=: read -r user pass uid gid gecos home shell; do
      printf '%s: %s\n' "$user" "$shell"
    done < /etc/passwd

如果文件是用tag做分隔的, 可以设置IFS=$'\t', 不过注意了, 多个连着的tab会被当成一个(Ksh93/Zsh中可以用IFS=$'\t\t', 但Bash中没用)

如果你给的变量数多于这行中的列数, 多出来的变量就是空, 如果少于列数,最后多出来的所有的数据会写到最后一个变量中

    read -r first last junk <<< 'Bob Smith 123 Main Street Elk Grove Iowa 123-555-6789'

    # first will contain "Bob", and last will contain "Smith".
    # junk holds everything else.

也可以使用点位符忽略我们不需要的值

    read -r _ _ first middle last _ <<< "$record"
    
    # We skip the first two fields, then read the next three.
    # Remember, the final _ can absorb any number of fields.
    # It doesn't need to be repeated there.

再次注意, bash中用_肯定是没问题的, 但其他一些shell中, _可能有其它含义,有可能会使脚本完全不能用, 所以最好选一个不会在脚本的其它地方用到的变量替代_,以防万一.

也可以把一个命令的输出做为read的输入:

    some command | while IFS= read -r line; do
      printf '%s\n' "$line"
    done

比如find找到需要的文件后, 将他们重命名,把空格改成下划线.

    find . -type f -print0 | while IFS= read -r -d '' file; do
        mv "$file" "${file// /_}"
    done

注意find里面用到了print0, 是说一个null作为文件名的分隔符; read用了-d选项,也是说用null做分隔符. 默认情况下,它们都是用\n做分隔符的,但文件名本身就有\n时,脚本就出错了. IFS也要设置为空字符串,避免文件名前后有空白符的情况.


**我的文件最后一行没有最后的换行符!**

最后一行不是以\n结尾的话,read会读取之后返回false,所以就跳出了while循环,循环里面是不能输出这最后一行的. 可以这样处理:

    # Emulate cat
    while IFS= read -r line; do
      printf '%s\n' "$line"
    done < "$file"
    [[ -n $line ]] && printf %s "$line"

再看下面这段代码:

    # This does not work:
    printf 'line 1\ntruncated line 2' | while read -r line; do echo $line; done
    
    # This does not work either:
    printf 'line 1\ntruncated line 2' | while read -r line; do echo "$line"; done; [[ $line ]] && echo -n "$line"
    
    # This works:
    printf 'line 1\ntruncated line 2' | { while read -r line; do echo "$line"; done; [[ $line ]] && echo "$line"; }

第一段显然不会输出最后一行, **但奇怪的是第二行也不会!**, 因为while循环是在一个subshell里面的, subshell里面的变量的生命周期只在subshell里面; 第三段就{}强制把while和后面的判断放在一个subshell里面,就OK了.

也可以用下面这样(我觉得挺有意思的)

    printf 'line 1\ntruncated line 2' | while read -r line || [[ -n $line ]]; do echo "$line"; done
