const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray;

const isDev = process.argv.includes('--dev');

// Data storage path
const userDataPath = app.getPath('userData');
const dataFile = path.join(userDataPath, 'nexus-tasks.json');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 860,
    minHeight: 560,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d0e12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools();
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Keep running in tray on close
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Create a simple tray icon (16x16 programmatic PNG fallback)
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  let trayIcon;
  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
  } else {
    trayIcon = nativeImage.createEmpty();
  }
  tray = new Tray(trayIcon);
  tray.setToolTip('NEXUS — Task Manager');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show NEXUS', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
}

// IPC: load tasks
ipcMain.handle('load-tasks', () => {
  try {
    if (fs.existsSync(dataFile)) {
      return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    }
  } catch (e) { console.error('Load error', e); }
  return [];
});

// IPC: save tasks
ipcMain.handle('save-tasks', (_, tasks) => {
  try {
    fs.writeFileSync(dataFile, JSON.stringify(tasks, null, 2), 'utf8');
    return true;
  } catch (e) { console.error('Save error', e); return false; }
});

// IPC: export tasks
ipcMain.handle('export-tasks', async (_, tasks) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export NEXUS Tasks',
    defaultPath: `nexus-tasks-${new Date().toISOString().slice(0,10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (filePath) {
    fs.writeFileSync(filePath, JSON.stringify(tasks, null, 2), 'utf8');
    return true;
  }
  return false;
});

// IPC: import tasks
ipcMain.handle('import-tasks', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import NEXUS Tasks',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (filePaths && filePaths[0]) {
    try {
      const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
      return data;
    } catch (e) { return null; }
  }
  return null;
});

// IPC: window controls
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.hide());
ipcMain.on('window-quit', () => { app.isQuitting = true; app.quit(); });

// Build native app menu
const menuTemplate = [
  {
    label: 'NEXUS',
    submenu: [
      { label: 'About NEXUS', click: () => {
        dialog.showMessageBox(mainWindow, {
          title: 'About NEXUS',
          message: 'NEXUS Task Manager v1.0.0',
          detail: 'Enterprise-grade task manager with timers.\nBuilt with Electron. Free for everyone.\n\nBy Vinay — vinay-engineer.me',
        });
      }},
      { type: 'separator' },
      { label: 'Quit NEXUS', accelerator: 'CmdOrCtrl+Q', click: () => { app.isQuitting = true; app.quit(); } },
    ],
  },
  {
    label: 'Tasks',
    submenu: [
      { label: 'New Task', accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.send('shortcut-new-task') },
      { label: 'Search', accelerator: 'CmdOrCtrl+F', click: () => mainWindow.webContents.send('shortcut-focus-search') },
      { type: 'separator' },
      { label: 'Export Tasks', accelerator: 'CmdOrCtrl+E', click: () => mainWindow.webContents.send('shortcut-export') },
      { label: 'Import Tasks', accelerator: 'CmdOrCtrl+I', click: () => mainWindow.webContents.send('shortcut-import') },
    ],
  },
  {
    label: 'View',
    submenu: [
      { label: 'Toggle Developer Tools', accelerator: 'F12', click: () => mainWindow.webContents.toggleDevTools() },
      { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.reload() },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
    ],
  },
];

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Don't quit — tray keeps it alive
  }
});

app.on('activate', () => {
  if (mainWindow) mainWindow.show();
  else createWindow();
});

app.on('before-quit', () => { app.isQuitting = true; });
