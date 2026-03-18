# Release 发布规则

本项目从现在开始采用**人工维护 Release 更新日志**，不再接受 GitHub 自动生成说明作为正式发布文案。

## 硬性规则

1. GitHub Release 正文必须是**完整更新日志**。
2. **禁止**使用只有以下内容的自动文案：

   `**Full Changelog**: https://github.com/.../compare/...`

3. 每个版本都必须在仓库中新增一份说明文件：

   `release-notes/<tag>.md`

   例如：

   `release-notes/v0.6.2.md`

4. GitHub Release 页面正文应与仓库内的版本说明文件保持一致。
5. Windows / macOS 的自动构建工作流只负责**打包并上传资产**，不再负责自动生成 Release 文案。

## 推荐流程

1. 完成功能开发并推送代码
2. 更新版本号
3. 新建 `release-notes/<tag>.md`
4. 按模板补全完整更新日志
5. 使用说明文件创建或更新 Release：

   ```bash
   gh release create v0.6.3 --target main --title "v0.6.3" -F release-notes/v0.6.3.md
   ```

   或：

   ```bash
   gh release edit v0.6.3 -F release-notes/v0.6.3.md
   ```

6. 发布 Release 后，由 GitHub Actions 自动构建并上传 Windows 资产
7. 如需 macOS 资产，再手动触发 `build-mac-release.yml`

## 更新日志要求

建议使用更接近正式产品发布说明的结构，而不是简单罗列 bullet：

- 版本摘要
- 重点更新
- 体验优化 / 修复
- 升级说明
- Release 资产说明

推荐写法：

- 开头先用 2 到 4 行说清“这一版主要解决什么”
- 重点更新按 `### 1. / 2. / 3.` 分段
- 每段下面只写与用户感知直接相关的变化
- 末尾保留一个资产表格，方便用户快速下载和识别用途

## 模板

请参考：

- `release-notes/TEMPLATE.md`
