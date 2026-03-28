const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexusAPI', {
  // --- Auth ---
  login: (credentials) => ipcRenderer.invoke('auth-login', credentials),
  register: (data) => ipcRenderer.invoke('auth-register', data),
  verifyOTP: (data) => ipcRenderer.invoke('auth-verify-otp', data),
  getMe: () => ipcRenderer.invoke('auth-get-me'),
  logout: () => ipcRenderer.invoke('auth-logout'),

  // --- Tasks ---
  loadTasks: () => ipcRenderer.invoke('load-tasks'),
  saveTasks: (tasks) => ipcRenderer.invoke('save-tasks', tasks),
  exportTasks: (tasks) => ipcRenderer.invoke('export-tasks', tasks),
  importTasks: () => ipcRenderer.invoke('import-tasks'),

  // --- Habits ---
  loadHabits: () => ipcRenderer.invoke('load-habits'),
  saveHabit: (habit) => ipcRenderer.invoke('save-habit', habit),
  deleteHabit: (id) => ipcRenderer.invoke('delete-habit', id),
  checkinHabit: (habitId, date) => ipcRenderer.invoke('checkin-habit', { habitId, date }),
  uncheckHabit: (habitId, date) => ipcRenderer.invoke('uncheck-habit', { habitId, date }),
  loadHabitLogs: (habitId, days) => ipcRenderer.invoke('load-habit-logs', { habitId, days }),
  loadAllHabitLogs: (days) => ipcRenderer.invoke('load-all-habit-logs', { days }),

  // --- Goals ---
  loadGoals: () => ipcRenderer.invoke('load-goals'),
  saveGoal: (goal) => ipcRenderer.invoke('save-goal', goal),
  deleteGoal: (id) => ipcRenderer.invoke('delete-goal', id),
  updateMilestone: (goalId, milestoneId, current) => ipcRenderer.invoke('update-milestone', { goalId, milestoneId, current }),

  // --- Fitness ---
  getFitnessLog: (date) => ipcRenderer.invoke('get-fitness-log', date),
  saveFitnessLog: (log) => ipcRenderer.invoke('save-fitness-log', log),
  getFitnessHistory: (days) => ipcRenderer.invoke('get-fitness-history', days),

  // --- Career ---
  loadCareerLogs: (days) => ipcRenderer.invoke('load-career-logs', days),
  saveCareerLog: (log) => ipcRenderer.invoke('save-career-log', log),
  deleteCareerLog: (id) => ipcRenderer.invoke('delete-career-log', id),

  // --- Focus ---
  saveFocusSession: (session) => ipcRenderer.invoke('save-focus-session', session),
  loadFocusSessions: (days) => ipcRenderer.invoke('load-focus-sessions', days),

  // --- Notifications ---
  loadNotifications: () => ipcRenderer.invoke('load-notifications'),
  markNotificationRead: (id) => ipcRenderer.invoke('mark-notification-read', id),
  clearNotifications: () => ipcRenderer.invoke('clear-notifications'),

  // --- Dashboard & Analytics ---
  getDashboardData: () => ipcRenderer.invoke('get-dashboard-data'),
  getWeeklyReview: () => ipcRenderer.invoke('get-weekly-review'),
  generateSnapshot: () => ipcRenderer.invoke('generate-snapshot'),

  // --- Smart Alerts ---
  checkAlerts: () => ipcRenderer.invoke('check-alerts'),

  // --- System Notifications ---
  showNativeNotification: (title, body) => ipcRenderer.send('show-native-notification', { title, body }),
  flashWindow: () => ipcRenderer.send('flash-window'),
  emailTimerDone: (taskTitle) => ipcRenderer.send('email-timer-done', { taskTitle }),
  emailFocusDone: (title, durationMin) => ipcRenderer.send('email-focus-done', { title, durationMin }),

  // --- Window Controls ---
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  quit: () => ipcRenderer.send('window-quit'),

  // --- Shortcuts ---
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
