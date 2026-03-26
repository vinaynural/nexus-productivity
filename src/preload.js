const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexusAPI', {
  // Data persistence (native file system, not localStorage)
  loadTasks: () => ipcRenderer.invoke('load-tasks'),
  saveTasks: (tasks) => ipcRenderer.invoke('save-tasks', tasks),
  exportTasks: (tasks) => ipcRenderer.invoke('export-tasks', tasks),
  importTasks: () => ipcRenderer.invoke('import-tasks'),

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  quit: () => ipcRenderer.send('window-quit'),

  // Listen for menu shortcuts
  onShortcut: (channel, callback) => {
    const validChannels = [
      'shortcut-new-task',
      'shortcut-focus-search',
      'shortcut-export',
      'shortcut-import',
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, callback);
    }
  },
  removeShortcut: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
