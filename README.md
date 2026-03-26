# NEXUS — Task Manager

Enterprise-grade task manager with timers. **Free for everyone.**

Built with Electron. Runs on Windows, Mac, and Linux.

---

## Quick Start (Run from source)

### Requirements
- Node.js 18+ (download from https://nodejs.org)

### Steps

```bash
# 1. Install dependencies (first time only)
npm install

# 2. Run the app
npm start
```

That's it. NEXUS opens as a native desktop window.

---

## Build a distributable installer

```bash
# Windows (.exe installer + portable)
npm run build:win

# macOS (.dmg)
npm run build:mac

# Linux (.AppImage + .deb)
npm run build:linux

# All platforms at once
npm run build:all
```

Built files appear in the `dist/` folder.

---

## Features

- **Workspaces** — Work and Personal, fully separated
- **Priority levels** — Urgent / High / Normal / Low with color coding
- **Per-task countdown timers** — set any duration, start/pause/reset
- **Pomodoro presets** — 5m, 15m, 25m, 45m, 1h, 1.5h
- **Due dates** — overdue tasks highlighted in red
- **Custom tags** — tag tasks like #sprint-4, #dsa, #backend
- **Full-text search** — searches title, description, and tags
- **Right-click context menu** on every task
- **Export / Import** — save tasks as JSON, share across machines
- **Data stored locally** — no cloud, no account, no tracking
- **System tray** — closes to tray, always running in background
- **Keyboard shortcuts** — Ctrl/Cmd+N (new task), Ctrl/Cmd+F (search)

---

## Data Storage

Tasks are saved to your OS user data directory as `nexus-tasks.json`:
- **Windows:** `%APPDATA%\nexus-task-manager\nexus-tasks.json`
- **Mac:** `~/Library/Application Support/nexus-task-manager/nexus-tasks.json`
- **Linux:** `~/.config/nexus-task-manager/nexus-tasks.json`

---

## License

MIT — free to use, modify, and distribute.

By Vinay · vinay-engineer.me
# nexus-productivity
