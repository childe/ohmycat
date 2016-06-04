---
layout: post
title:  "vim下调整splited窗口大小"
date:   2016-06-04 15:45:43 +0800
categories: vim
keywords: vim resize window size
---

## 设置高度
>   :resize 60

## 设置宽度
>   :vertical resize 1000

## 调整高度
>   :resize +10  
>   :resize -10

## 快捷调整
`Ctrl-w +` 和 `Ctrl-w -` 可以快速调整窗口高度.  
`Ctrl-w >` 和 `Ctrl-w <` 可以快速调整窗口宽度.  
`10 Ctrl-w +` 可以一次增加10行的高度.  
`Ctrl-w =` 可以按平均分配每个窗口的高度.  
`Ctrl-w _` 把窗口调试设置成最大值(还要留一行给命令窗口).  
`Ctrl-w |` 把窗口宽度设置成最大值

## 做个map映射
一性次增加到1.5倍, 或者减少到原来0.67的高度

>   nnoremap <silent> <Leader>+ :exe "resize " . (winheight(0) * 3/2)<CR>  
>   nnoremap <silent> <Leader>- :exe "resize " . (winheight(0) * 2/3)<CR>
