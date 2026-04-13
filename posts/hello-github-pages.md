---
title: "用 GitHub Pages 搭一个自己的技术站"
date: "2026-04-11"
description: "不用模板，自己写 HTML 和 CSS，再用 Markdown 管理内容。"
tags: ["Swift", "SwiftUI", "iOS"]
slug: "hello-github-pages"
draft: false
---

## 为什么这样做

我希望页面结构和样式完全由自己控制，但文章内容仍然使用 Markdown 维护。

这意味着站点应该在构建阶段把 Markdown 转成静态 HTML，而不是在浏览器里动态读取和渲染。

## 第一版目标

- 首页
- 文章列表页
- 单篇文章页
- 标签页

## 一个代码块示例

```html
<article class="post-card">
  <h2>Hello</h2>
</article>
```
