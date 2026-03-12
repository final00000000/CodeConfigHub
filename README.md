# CodeConfigHub

桌面级可视化配置编辑器，为 **Codex CLI** 与 **Claude Code** 提供统一的配置管理工作台。

[![Release](https://img.shields.io/github/v/release/final00000000/CodeConfigHub?style=flat-square)](https://github.com/final00000000/CodeConfigHub/releases/latest)
[![License](https://img.shields.io/github/license/final00000000/CodeConfigHub?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-blue?style=flat-square)]()

---

## ✨ 功能亮点

- **双引擎支持** — 同时管理 Codex CLI（TOML）和 Claude Code（JSON）配置
- **可视化编辑** — 表单化操作，告别手写配置文件
- **实时预览** — 编辑时同步生成代码预览，所见即所得
- **自动发现** — 智能扫描用户级 & 项目级配置文件
- **MCP Server 管理** — 可折叠卡片式 MCP 服务器配置
- **高阶参数深度解析** — 自动识别嵌套配置并正确回填
- **明暗主题** — 一键切换 Light / Dark 模式
- **内置更新检查** — 连接 GitHub Releases，一键获取最新版

## 📸 界面预览

> 启动后自动扫描配置文件，左侧导航选择，右侧实时编辑与代码预览。

## 🚀 快速开始

### 下载安装

前往 [Releases](https://github.com/final00000000/CodeConfigHub/releases/latest) 页面，下载最新版安装包：

| 平台 | 文件 |
|------|------|
| Windows | `CodeConfigHub Setup x.x.x.exe` |

### 从源码运行

```bash
git clone https://github.com/final00000000/CodeConfigHub.git
cd CodeConfigHub
npm install
npm start
```

### 打包构建

```bash
# Windows
npm run package:win

# macOS（需在 macOS 环境下执行）
npm run package:mac
```

## 🗂️ 支持的配置文件

### Codex CLI

| 文件 | 路径 | 级别 |
|------|------|------|
| `config.toml` | `~/.codex/config.toml` | 用户级 |
| `config.toml` | `项目/.codex/config.toml` | 项目级 |
| `AGENTS.md` | `~/.codex/AGENTS.md` | 用户级 |
| `AGENTS.md` | `项目/AGENTS.md` | 项目级 |

### Claude Code

| 文件 | 路径 | 级别 |
|------|------|------|
| `settings.json` | `~/.claude/settings.json` | 用户级 |
| `settings.json` | `项目/.claude/settings.json` | 项目级 |
| `.mcp.json` | `~/.claude/.mcp.json` | 用户级 |
| `.mcp.json` | `项目/.mcp.json` | 项目级 |

## 🏗️ 技术栈

| 组件 | 技术 |
|------|------|
| 框架 | Electron |
| 前端 | 原生 JS + CSS（零框架依赖） |
| TOML 解析 | smol-toml |
| 自动更新 | electron-updater + GitHub Releases |
| 打包 | electron-builder |

## 📁 项目结构

```
├── main.js                 # Electron 主进程
├── preload.js              # 预加载脚本（IPC 桥接）
├── src/
│   ├── index.html          # 应用入口
│   ├── index.css           # 全局样式
│   ├── renderer.js         # 渲染层主逻辑
│   ├── components/
│   │   ├── sidebar.js      # 侧边栏导航
│   │   ├── form-controls.js # 通用表单组件
│   │   └── toast.js        # 通知提示
│   ├── editors/
│   │   ├── codex-editor.js # Codex 可视化编辑器
│   │   ├── claude-editor.js# Claude 可视化编辑器
│   │   └── code-preview.js # 代码预览面板
│   └── services/
│       ├── config-discovery.js # 配置文件发现
│       ├── file-service.js     # 文件读写
│       ├── toml-service.js     # TOML 解析/序列化
│       └── json-service.js     # JSON 解析/序列化
└── package.json
```

## 📜 License

[MIT](LICENSE)
