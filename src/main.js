// ============================================================================
// NEXUS — Daily Life Operating System
// Electron Main Process
// ============================================================================

const path = require('path');
const fs = require('fs');

// Load .env — try multiple locations (dev → packaged app)
const envCandidates = [
  path.join(__dirname, '..', '.env'),                              // dev: project root
  path.join(process.resourcesPath || '', '.env'),                  // packaged: resources/
  path.join(path.dirname(process.execPath), '.env'),               // next to .exe
  path.join(path.dirname(process.execPath), 'resources', '.env'),  // resources next to .exe
];
let envLoaded = false;
for (const p of envCandidates) {
  try {
    if (p && fs.existsSync(p)) {
      require('dotenv').config({ path: p, override: true });
      console.log('Loaded .env from:', p);
      envLoaded = true;
      break;
    }
  } catch(e) {}
}
if (!envLoaded) console.error('WARNING: .env not found! App may not connect to database.');

const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell, dialog } = require('electron');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

// --- Models ---
const Task = require('./models/Task');
const User = require('./models/User');
const Habit = require('./models/Habit');
const HabitLog = require('./models/HabitLog');
const Goal = require('./models/Goal');
const FitnessLog = require('./models/FitnessLog');
const FocusSession = require('./models/FocusSession');
const CareerLog = require('./models/CareerLog');
const Notification = require('./models/Notification');
const DailySnapshot = require('./models/DailySnapshot');

// ============================================================================
// SERVICES INITIALIZATION
// ============================================================================

const MONGODB_URI = process.env.MONGODB_URI;

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

let currentUser = null;
let dbConnected = false;

async function connectDB() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI is not set — .env file may be missing');
    return;
  }
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,  // 10s timeout instead of hanging forever
      connectTimeoutMS: 10000,
    });
    dbConnected = true;
    console.log('Connected to MongoDB Atlas');
  } catch (err) {
    console.error('MongoDB Connection Error:', err.message);
  }
}
connectDB();

// ============================================================================
// DATE HELPERS
// ============================================================================

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatDateRange(startStr, endStr) {
  const opts = { month: 'short', day: 'numeric' };
  const s = new Date(startStr + 'T00:00:00');
  const e = new Date(endStr + 'T00:00:00');
  return `${s.toLocaleDateString('en-US', opts)} - ${e.toLocaleDateString('en-US', opts)}`;
}

// ============================================================================
// TASK FIELD MAPPING
// ============================================================================

function toDbTask(t, userId) {
  return {
    task_id: t.id,
    title: t.title,
    description: t.desc || '',
    workspace_id: t.workspace,
    priority_level: t.priority,
    status_id: t.done ? 'done' : 'todo',
    status_label: t.done ? 'Done' : 'To Do',
    estimated_duration_sec: t.timerTotal,
    timer_remaining_sec: t.timerLeft,
    timer_is_running: t.timerRunning || false,
    timer_accumulated_sec: t.timerAccumulated || 0,
    due_date_utc: t.due || null,
    ai_tags: t.tag ? [t.tag] : [],
    energy_requirement: t.energy,
    category: t.category,
    source_goal_id: t.goalId || null,
    deferred_count: t.deferred || 0,
    creator_id: userId,
    created_at: t.created || new Date(),
    updated_at: new Date()
  };
}

function toFrontendTask(d) {
  return {
    id: d.task_id,
    title: d.title,
    desc: d.description,
    workspace: d.workspace_id,
    priority: d.priority_level,
    done: d.status_id === 'done',
    timerTotal: d.estimated_duration_sec,
    timerLeft: d.timer_remaining_sec,
    timerRunning: false,
    timerAccumulated: d.timer_accumulated_sec || 0,
    due: d.due_date_utc,
    tag: d.ai_tags && d.ai_tags.length > 0 ? d.ai_tags[0] : '',
    energy: d.energy_requirement,
    category: d.category,
    goalId: d.source_goal_id,
    deferred: d.deferred_count,
    created: d.created_at
  };
}

// ============================================================================
// STREAK CALCULATION
// ============================================================================

async function calculateStreak(habit) {
  const logs = await HabitLog.find({ habit_id: habit._id }).sort({ date: -1 }).lean();
  const logSet = new Set(logs.map(l => l.date));

  let streak = 0;
  const today = new Date();

  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat

    // Check if this day is relevant for the habit's frequency
    let isDueDay = false;
    const freqType = habit.frequency && habit.frequency.type ? habit.frequency.type : 'daily';

    if (freqType === 'daily') {
      isDueDay = true;
    } else if (freqType === 'weekdays') {
      isDueDay = dayOfWeek >= 1 && dayOfWeek <= 5;
    } else if (freqType === 'weekend') {
      isDueDay = dayOfWeek === 0 || dayOfWeek === 6;
    } else if (freqType === 'custom') {
      const days = (habit.frequency && habit.frequency.days) || [];
      isDueDay = days.includes(dayOfWeek);
    }

    if (!isDueDay) continue;

    if (logSet.has(dateStr)) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

// ============================================================================
// ELECTRON WINDOW
// ============================================================================

let mainWindow;
let tray;
const isDev = process.argv.includes('--dev');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 860,
    minHeight: 560,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d0e12',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ============================================================================
// TRAY
// ============================================================================

function createTray() {
  let trayIcon;
  const trayIconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  try {
    if (fs.existsSync(trayIconPath)) {
      trayIcon = nativeImage.createFromPath(trayIconPath);
    } else {
      trayIcon = nativeImage.createEmpty();
    }
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('NEXUS');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show NEXUS', click: () => { mainWindow.show(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => { mainWindow.show(); });
}

// ============================================================================
// WINDOW CONTROLS
// ============================================================================

ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.hide());
ipcMain.on('window-quit', () => { app.isQuitting = true; app.quit(); });

// --- NATIVE NOTIFICATIONS ---
const { Notification: ElectronNotification } = require('electron');

ipcMain.on('show-native-notification', (_e, { title, body }) => {
  if (ElectronNotification.isSupported()) {
    const notif = new ElectronNotification({
      title: title || 'NEXUS',
      body: body || '',
      icon: path.join(__dirname, 'assets', 'icon.png'),
      silent: false
    });
    notif.on('click', () => {
      if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    });
    notif.show();
  }
});

ipcMain.on('flash-window', () => {
  if (mainWindow && !mainWindow.isFocused()) {
    mainWindow.flashFrame(true);
    // Stop flashing after 5 seconds
    setTimeout(() => { if (mainWindow) mainWindow.flashFrame(false); }, 5000);
  }
});

// ============================================================================
// IPC HANDLERS — AUTH
// ============================================================================

ipcMain.handle('auth-login', async (_e, { email, password }) => {
  try {
    if (!dbConnected) return { success: false, message: 'Database not connected. Check your internet connection and restart the app.' };
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return { success: false, message: 'User not found' };
    if (!user.is_verified) return { success: false, message: 'Please verify your email first' };

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return { success: false, message: 'Invalid password' };

    currentUser = user;
    return {
      success: true,
      user: { id: user._id.toString(), name: user.first_name, email: user.email }
    };
  } catch (err) {
    console.error('Login error:', err);
    return { success: false, message: 'Login failed' };
  }
});

ipcMain.handle('auth-register', async (_e, { email, password, first_name: firstName }) => {
  try {
    if (!dbConnected) return { success: false, message: 'Database not connected. Check your internet connection and restart the app.' };
    const lowerEmail = email.toLowerCase();
    const existing = await User.findOne({ email: lowerEmail });

    if (existing && existing.is_verified) {
      return { success: false, message: 'Email already registered' };
    }

    const password_hash = await bcrypt.hash(password, 10);
    const otp_code = String(Math.floor(100000 + Math.random() * 900000));
    const otp_expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (existing && !existing.is_verified) {
      existing.password_hash = password_hash;
      existing.first_name = firstName;
      existing.otp_code = otp_code;
      existing.otp_expires = otp_expires;
      await existing.save();
    } else {
      await User.create({
        email: lowerEmail,
        password_hash,
        first_name: firstName,
        is_verified: false,
        otp_code,
        otp_expires
      });
    }

    // Send OTP email
    await transporter.sendMail({
      from: `"NEXUS" <${process.env.EMAIL_USER}>`,
      to: lowerEmail,
      subject: 'NEXUS — Verify Your Email',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0d0e12;color:#e0e0e0;border-radius:12px;">
          <h1 style="color:#6c63ff;margin-bottom:8px;">NEXUS</h1>
          <p>Hi ${firstName},</p>
          <p>Your verification code is:</p>
          <div style="font-size:36px;font-weight:bold;letter-spacing:8px;text-align:center;padding:20px;background:#1a1b23;border-radius:8px;color:#6c63ff;">${otp_code}</div>
          <p style="margin-top:16px;color:#888;">This code expires in 10 minutes.</p>
        </div>
      `
    });

    return { success: true, needsVerification: true, email: lowerEmail };
  } catch (err) {
    console.error('Register error:', err);
    return { success: false, message: 'Registration failed' };
  }
});

ipcMain.handle('auth-verify-otp', async (_e, { email, otp }) => {
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return { success: false, message: 'User not found' };
    if (user.otp_code !== otp) return { success: false, message: 'Invalid verification code' };
    if (user.otp_expires < new Date()) return { success: false, message: 'Code has expired' };

    user.is_verified = true;
    user.otp_code = undefined;
    await user.save();

    currentUser = user;
    return {
      success: true,
      user: { id: user._id.toString(), name: user.first_name, email: user.email }
    };
  } catch (err) {
    console.error('OTP verify error:', err);
    return { success: false, message: 'Verification failed' };
  }
});

ipcMain.handle('auth-get-me', async () => {
  if (!currentUser) return null;
  return { id: currentUser._id.toString(), name: currentUser.first_name };
});

ipcMain.handle('auth-logout', async () => {
  currentUser = null;
  return { success: true };
});

// ============================================================================
// IPC HANDLERS — TASKS
// ============================================================================

ipcMain.handle('load-tasks', async () => {
  try {
    if (!currentUser) return [];
    const tasks = await Task.find({ creator_id: currentUser._id.toString() })
      .sort({ created_at: -1 })
      .lean();
    return tasks.map(toFrontendTask);
  } catch (err) {
    console.error('Load tasks error:', err);
    return [];
  }
});

ipcMain.handle('save-tasks', async (_e, tasks) => {
  try {
    if (!currentUser) return { success: false, message: 'Not logged in' };
    const userId = currentUser._id.toString();
    await Task.deleteMany({ creator_id: userId });
    if (tasks && tasks.length > 0) {
      const docs = tasks.map(t => toDbTask(t, userId));
      await Task.insertMany(docs);
    }
    return { success: true };
  } catch (err) {
    console.error('Save tasks error:', err);
    return { success: false, message: 'Failed to save tasks' };
  }
});

ipcMain.handle('export-tasks', async (_e, tasks) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Tasks',
      defaultPath: 'nexus-tasks.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });
    if (result.canceled) return false;
    fs.writeFileSync(result.filePath, JSON.stringify(tasks, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Export tasks error:', err);
    return false;
  }
});

ipcMain.handle('import-tasks', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Tasks',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (result.canceled) return [];
    const data = fs.readFileSync(result.filePaths[0], 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Import tasks error:', err);
    return [];
  }
});

// ============================================================================
// IPC HANDLERS — HABITS
// ============================================================================

ipcMain.handle('load-habits', async () => {
  try {
    if (!currentUser) return [];
    const habits = await Habit.find({ user_id: currentUser._id.toString(), is_active: true })
      .sort({ created_at: 1 })
      .lean();
    return habits;
  } catch (err) {
    console.error('Load habits error:', err);
    return [];
  }
});

ipcMain.handle('save-habit', async (_e, habit) => {
  try {
    if (!currentUser) return { success: false, message: 'Not logged in' };
    let saved;
    if (habit._id) {
      saved = await Habit.findByIdAndUpdate(habit._id, habit, { new: true }).lean();
    } else {
      habit.user_id = currentUser._id.toString();
      saved = await Habit.create(habit);
      saved = saved.toObject();
    }
    return saved;
  } catch (err) {
    console.error('Save habit error:', err);
    return { success: false, message: 'Failed to save habit' };
  }
});

ipcMain.handle('delete-habit', async (_e, habitId) => {
  try {
    await Habit.findByIdAndUpdate(habitId, { is_active: false });
    return { success: true };
  } catch (err) {
    console.error('Delete habit error:', err);
    return { success: false, message: 'Failed to delete habit' };
  }
});

ipcMain.handle('checkin-habit', async (_e, { habitId, date }) => {
  try {
    if (!currentUser) return { success: false, message: 'Not logged in' };
    const userId = currentUser._id.toString();

    await HabitLog.create({
      habit_id: habitId,
      user_id: userId,
      date: date || todayStr(),
      completed: true,
      completed_at: new Date()
    });

    const habit = await Habit.findById(habitId);
    if (!habit) return { success: false, message: 'Habit not found' };

    const streak = await calculateStreak(habit);
    habit.current_streak = streak;
    habit.longest_streak = Math.max(streak, habit.longest_streak || 0);
    habit.total_completions = (habit.total_completions || 0) + 1;
    await habit.save();

    return habit.toObject();
  } catch (err) {
    console.error('Checkin habit error:', err);
    return { success: false, message: 'Failed to check in habit' };
  }
});

ipcMain.handle('uncheck-habit', async (_e, { habitId, date }) => {
  try {
    if (!currentUser) return { success: false, message: 'Not logged in' };

    await HabitLog.deleteOne({ habit_id: habitId, date: date || todayStr() });

    const habit = await Habit.findById(habitId);
    if (!habit) return { success: false, message: 'Habit not found' };

    const streak = await calculateStreak(habit);
    habit.current_streak = streak;
    habit.total_completions = Math.max((habit.total_completions || 0) - 1, 0);
    await habit.save();

    return habit.toObject();
  } catch (err) {
    console.error('Uncheck habit error:', err);
    return { success: false, message: 'Failed to uncheck habit' };
  }
});

ipcMain.handle('load-habit-logs', async (_e, { habitId, days }) => {
  try {
    const since = daysAgoStr(days || 30);
    const logs = await HabitLog.find({ habit_id: habitId, date: { $gte: since } }).lean();
    return logs;
  } catch (err) {
    console.error('Load habit logs error:', err);
    return [];
  }
});

ipcMain.handle('load-all-habit-logs', async (_e, { days }) => {
  try {
    if (!currentUser) return [];
    const since = daysAgoStr(days || 30);
    const logs = await HabitLog.find({
      user_id: currentUser._id.toString(),
      date: { $gte: since }
    }).lean();
    return logs;
  } catch (err) {
    console.error('Load all habit logs error:', err);
    return [];
  }
});

// ============================================================================
// IPC HANDLERS — GOALS
// ============================================================================

function calcGoalProgress(milestones) {
  if (!milestones || milestones.length === 0) return 0;
  let total = 0;
  for (const m of milestones) {
    const target = m.target || 1;
    const current = m.current || 0;
    total += Math.min((current / target) * 100, 100);
  }
  return Math.round(total / milestones.length);
}

ipcMain.handle('load-goals', async () => {
  try {
    if (!currentUser) return [];
    const goals = await Goal.find({ user_id: currentUser._id.toString() })
      .sort({ created_at: -1 })
      .lean();
    return goals;
  } catch (err) {
    console.error('Load goals error:', err);
    return [];
  }
});

ipcMain.handle('save-goal', async (_e, goal) => {
  try {
    if (!currentUser) return { success: false, message: 'Not logged in' };

    goal.progress_pct = calcGoalProgress(goal.milestones);

    let saved;
    if (goal._id) {
      saved = await Goal.findByIdAndUpdate(goal._id, goal, { new: true }).lean();
    } else {
      goal.user_id = currentUser._id.toString();
      saved = await Goal.create(goal);
      saved = saved.toObject();
    }
    return saved;
  } catch (err) {
    console.error('Save goal error:', err);
    return { success: false, message: 'Failed to save goal' };
  }
});

ipcMain.handle('delete-goal', async (_e, goalId) => {
  try {
    await Goal.findByIdAndDelete(goalId);
    return { success: true };
  } catch (err) {
    console.error('Delete goal error:', err);
    return { success: false, message: 'Failed to delete goal' };
  }
});

ipcMain.handle('update-milestone', async (_e, { goalId, milestoneId, current }) => {
  try {
    const goal = await Goal.findById(goalId);
    if (!goal) return { success: false, message: 'Goal not found' };

    const milestone = goal.milestones.find(m => m.id === milestoneId);
    if (!milestone) return { success: false, message: 'Milestone not found' };

    milestone.current = current;
    if (current >= milestone.target) {
      milestone.completed = true;
    }

    goal.progress_pct = calcGoalProgress(goal.milestones);

    const allComplete = goal.milestones.every(m => m.completed);
    if (allComplete) {
      goal.status = 'completed';
    }

    await goal.save();
    return goal.toObject();
  } catch (err) {
    console.error('Update milestone error:', err);
    return { success: false, message: 'Failed to update milestone' };
  }
});

// ============================================================================
// IPC HANDLERS — FITNESS
// ============================================================================

ipcMain.handle('get-fitness-log', async (_e, date) => {
  try {
    if (!currentUser) return null;
    const log = await FitnessLog.findOne({
      user_id: currentUser._id.toString(),
      date: date || todayStr()
    }).lean();
    return log || null;
  } catch (err) {
    console.error('Get fitness log error:', err);
    return null;
  }
});

ipcMain.handle('save-fitness-log', async (_e, logData) => {
  try {
    if (!currentUser) return { success: false, message: 'Not logged in' };
    const userId = currentUser._id.toString();
    const date = logData.date || todayStr();

    const saved = await FitnessLog.findOneAndUpdate(
      { user_id: userId, date },
      { ...logData, user_id: userId, date },
      { upsert: true, new: true }
    ).lean();

    return saved;
  } catch (err) {
    console.error('Save fitness log error:', err);
    return { success: false, message: 'Failed to save fitness log' };
  }
});

ipcMain.handle('get-fitness-history', async (_e, days) => {
  try {
    if (!currentUser) return [];
    const since = daysAgoStr(days || 30);
    const logs = await FitnessLog.find({
      user_id: currentUser._id.toString(),
      date: { $gte: since }
    }).sort({ date: -1 }).lean();
    return logs;
  } catch (err) {
    console.error('Get fitness history error:', err);
    return [];
  }
});

// ============================================================================
// IPC HANDLERS — CAREER
// ============================================================================

ipcMain.handle('load-career-logs', async (_e, days) => {
  try {
    if (!currentUser) return [];
    const since = daysAgoStr(days || 30);
    const logs = await CareerLog.find({
      user_id: currentUser._id.toString(),
      date: { $gte: since }
    }).sort({ date: -1 }).lean();
    return logs;
  } catch (err) {
    console.error('Load career logs error:', err);
    return [];
  }
});

ipcMain.handle('save-career-log', async (_e, logData) => {
  try {
    if (!currentUser) return { success: false, message: 'Not logged in' };
    let saved;
    if (logData._id) {
      saved = await CareerLog.findByIdAndUpdate(logData._id, logData, { new: true }).lean();
    } else {
      logData.user_id = currentUser._id.toString();
      logData.date = logData.date || todayStr();
      saved = await CareerLog.create(logData);
      saved = saved.toObject();
    }
    return saved;
  } catch (err) {
    console.error('Save career log error:', err);
    return { success: false, message: 'Failed to save career log' };
  }
});

ipcMain.handle('delete-career-log', async (_e, logId) => {
  try {
    await CareerLog.findByIdAndDelete(logId);
    return { success: true };
  } catch (err) {
    console.error('Delete career log error:', err);
    return { success: false, message: 'Failed to delete career log' };
  }
});

// ============================================================================
// IPC HANDLERS — FOCUS SESSIONS
// ============================================================================

ipcMain.handle('save-focus-session', async (_e, session) => {
  try {
    if (!currentUser) return { success: false, message: 'Not logged in' };
    session.user_id = currentUser._id.toString();
    const saved = await FocusSession.create(session);
    return saved.toObject();
  } catch (err) {
    console.error('Save focus session error:', err);
    return { success: false, message: 'Failed to save focus session' };
  }
});

ipcMain.handle('load-focus-sessions', async (_e, days) => {
  try {
    if (!currentUser) return [];
    const since = new Date();
    since.setDate(since.getDate() - (days || 30));
    const sessions = await FocusSession.find({
      user_id: currentUser._id.toString(),
      started_at: { $gte: since }
    }).sort({ started_at: -1 }).lean();
    return sessions;
  } catch (err) {
    console.error('Load focus sessions error:', err);
    return [];
  }
});

// ============================================================================
// IPC HANDLERS — NOTIFICATIONS
// ============================================================================

ipcMain.handle('load-notifications', async () => {
  try {
    if (!currentUser) return [];
    const notifs = await Notification.find({ user_id: currentUser._id.toString() })
      .sort({ created_at: -1 })
      .limit(50)
      .lean();
    return notifs;
  } catch (err) {
    console.error('Load notifications error:', err);
    return [];
  }
});

ipcMain.handle('mark-notification-read', async (_e, notifId) => {
  try {
    await Notification.findByIdAndUpdate(notifId, { is_read: true });
    return { success: true };
  } catch (err) {
    console.error('Mark notification read error:', err);
    return { success: false, message: 'Failed to mark notification read' };
  }
});

ipcMain.handle('clear-notifications', async () => {
  try {
    if (!currentUser) return { success: false, message: 'Not logged in' };
    await Notification.deleteMany({ user_id: currentUser._id.toString(), is_read: true });
    return { success: true };
  } catch (err) {
    console.error('Clear notifications error:', err);
    return { success: false, message: 'Failed to clear notifications' };
  }
});

// ============================================================================
// IPC HANDLERS — DASHBOARD
// ============================================================================

ipcMain.handle('get-dashboard-data', async () => {
  try {
    if (!currentUser) return null;
    const userId = currentUser._id.toString();
    const today = todayStr();

    // --- Tasks today ---
    const allTasks = await Task.find({ creator_id: userId }).lean();
    const todayTasks = allTasks.filter(t => {
      const created = t.created_at ? new Date(t.created_at).toISOString().slice(0, 10) : '';
      return created === today || (t.due_date_utc && new Date(t.due_date_utc).toISOString().slice(0, 10) === today);
    });
    const tasksDone = todayTasks.filter(t => t.status_id === 'done').length;

    // --- Habits today ---
    const habits = await Habit.find({ user_id: userId, is_active: true }).lean();
    const todayLogs = await HabitLog.find({ user_id: userId, date: today }).lean();
    const todayLogSet = new Set(todayLogs.map(l => l.habit_id.toString()));

    const dueHabitsToday = habits.filter(h => {
      const freq = h.frequency && h.frequency.type ? h.frequency.type : 'daily';
      const dow = new Date().getDay();
      if (freq === 'daily') return true;
      if (freq === 'weekdays') return dow >= 1 && dow <= 5;
      if (freq === 'weekend') return dow === 0 || dow === 6;
      if (freq === 'custom') return (h.frequency.days || []).includes(dow);
      return true;
    });
    const habitsDone = dueHabitsToday.filter(h => todayLogSet.has(h._id.toString())).length;

    // --- Streaks ---
    const streaks = habits
      .filter(h => (h.current_streak || 0) > 0)
      .sort((a, b) => (b.current_streak || 0) - (a.current_streak || 0))
      .slice(0, 5)
      .map(h => ({ title: h.title, icon: h.icon, streak: h.current_streak }));

    // --- Weekly scores from snapshots ---
    const weekAgo = daysAgoStr(6);
    const snapshots = await DailySnapshot.find({
      user_id: userId,
      date: { $gte: weekAgo }
    }).sort({ date: 1 }).lean();
    const weeklyScores = [];
    for (let i = 6; i >= 0; i--) {
      const d = daysAgoStr(i);
      const snap = snapshots.find(s => s.date === d);
      weeklyScores.push(snap ? snap.life_score : 0);
    }

    // --- Today fitness ---
    const fitnessLog = await FitnessLog.findOne({ user_id: userId, date: today }).lean();
    const todayFitness = fitnessLog ? {
      sleep: fitnessLog.sleep_hours || 0,
      water: fitnessLog.water_glasses || 0,
      energy: fitnessLog.energy_level || 0,
      mood: fitnessLog.mood || '',
      workout: (fitnessLog.workouts && fitnessLog.workouts.length > 0) || false
    } : { sleep: 0, water: 0, energy: 0, mood: '', workout: false };

    // --- Upcoming deadlines ---
    const upcomingTasks = allTasks
      .filter(t => t.due_date_utc && t.status_id !== 'done')
      .map(t => {
        const dueDate = new Date(t.due_date_utc);
        const daysLeft = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
        return { title: t.title, due: t.due_date_utc, daysLeft };
      })
      .filter(t => t.daysLeft >= 0 && t.daysLeft <= 14)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 5);

    // --- Recent notifications ---
    const recentNotifications = await Notification.find({ user_id: userId, is_read: false })
      .sort({ created_at: -1 })
      .limit(5)
      .lean();

    // --- Life Score ---
    const lifeScore = await computeLifeScore(userId, today, tasksDone, todayTasks.length, habitsDone, dueHabitsToday.length, fitnessLog, habits);

    return {
      lifeScore,
      todayTasks: { done: tasksDone, total: todayTasks.length },
      todayHabits: { done: habitsDone, total: dueHabitsToday.length },
      streaks,
      weeklyScores,
      todayFitness,
      upcomingDeadlines: upcomingTasks,
      recentNotifications
    };
  } catch (err) {
    console.error('Get dashboard data error:', err);
    return null;
  }
});

// ============================================================================
// LIFE SCORE COMPUTATION
// ============================================================================

async function computeLifeScore(userId, today, tasksDone, tasksTotal, habitsDone, habitsTotal, fitnessLog, habits) {
  // Task score (25%)
  let taskScore = 50;
  if (tasksTotal > 0) {
    taskScore = (tasksDone / tasksTotal) * 100;
  }

  // Habit score (25%)
  let habitScore = 50;
  if (habitsTotal > 0) {
    habitScore = (habitsDone / habitsTotal) * 100;
  }

  // Health score (20%)
  let healthScore = 40;
  if (fitnessLog) {
    const sleepH = fitnessLog.sleep_hours || 0;
    let sleepScore;
    if (sleepH >= 7 && sleepH <= 9) sleepScore = 100;
    else if (sleepH < 5) sleepScore = 20;
    else if (sleepH < 7) sleepScore = 20 + ((sleepH - 5) / 2) * 80;
    else sleepScore = 100 - ((sleepH - 9) / 2) * 40; // over 9

    const waterScore = Math.min(((fitnessLog.water_glasses || 0) / 8) * 100, 100);
    const energyScore = (fitnessLog.energy_level || 5) * 10;
    healthScore = (sleepScore + waterScore + energyScore) / 3;
  }

  // Career score (15%)
  let careerScore = 30;
  const todayCareer = await CareerLog.findOne({ user_id: userId, date: today }).lean();
  if (todayCareer) {
    careerScore = 80;
  } else {
    const threeDaysAgo = daysAgoStr(3);
    const recentCareer = await CareerLog.findOne({
      user_id: userId,
      date: { $gte: threeDaysAgo }
    }).lean();
    if (recentCareer) careerScore = 60;
  }

  // Consistency score (15%)
  let consistencyScore = 0;
  if (habits && habits.length > 0) {
    const topStreaks = habits
      .map(h => h.current_streak || 0)
      .sort((a, b) => b - a)
      .slice(0, 5);
    const avg = topStreaks.reduce((a, b) => a + b, 0) / topStreaks.length;
    consistencyScore = Math.min((avg / 30) * 100, 100);
  }

  const score = Math.round(
    taskScore * 0.25 +
    habitScore * 0.25 +
    healthScore * 0.20 +
    careerScore * 0.15 +
    consistencyScore * 0.15
  );

  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// IPC HANDLERS — WEEKLY REVIEW
// ============================================================================

ipcMain.handle('get-weekly-review', async () => {
  try {
    if (!currentUser) return null;
    const userId = currentUser._id.toString();
    const today = todayStr();
    const weekAgo = daysAgoStr(6);
    const twoWeeksAgo = daysAgoStr(13);

    // --- Tasks ---
    const allTasks = await Task.find({ creator_id: userId }).lean();
    const weekTasks = allTasks.filter(t => {
      const created = t.created_at ? new Date(t.created_at).toISOString().slice(0, 10) : '';
      return created >= weekAgo && created <= today;
    });
    const tasksCompleted = weekTasks.filter(t => t.status_id === 'done').length;
    const tasksTotal = weekTasks.length;

    // --- Habits rate ---
    const habits = await Habit.find({ user_id: userId, is_active: true }).lean();
    const weekLogs = await HabitLog.find({
      user_id: userId,
      date: { $gte: weekAgo, $lte: today }
    }).lean();

    let totalDueSlots = 0;
    let totalCompleted = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dow = d.getDay();

      for (const h of habits) {
        const freq = h.frequency && h.frequency.type ? h.frequency.type : 'daily';
        let isDue = false;
        if (freq === 'daily') isDue = true;
        else if (freq === 'weekdays') isDue = dow >= 1 && dow <= 5;
        else if (freq === 'weekend') isDue = dow === 0 || dow === 6;
        else if (freq === 'custom') isDue = (h.frequency.days || []).includes(dow);

        if (isDue) {
          totalDueSlots++;
          if (weekLogs.some(l => l.habit_id.toString() === h._id.toString() && l.date === dateStr)) {
            totalCompleted++;
          }
        }
      }
    }
    const habitsRate = totalDueSlots > 0 ? Math.round((totalCompleted / totalDueSlots) * 100) / 100 : 0;

    // --- Focus hours ---
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);
    const sessions = await FocusSession.find({
      user_id: userId,
      started_at: { $gte: weekStart }
    }).lean();
    const focusHours = Math.round(sessions.reduce((sum, s) => sum + (s.duration_actual_sec || 0), 0) / 3600 * 10) / 10;

    // --- Exercise days ---
    const fitnessLogs = await FitnessLog.find({
      user_id: userId,
      date: { $gte: weekAgo, $lte: today }
    }).lean();
    const exerciseDays = fitnessLogs.filter(l => l.workouts && l.workouts.length > 0).length;

    // --- Avg sleep & energy ---
    const sleepLogs = fitnessLogs.filter(l => l.sleep_hours != null);
    const avgSleep = sleepLogs.length > 0
      ? Math.round(sleepLogs.reduce((s, l) => s + l.sleep_hours, 0) / sleepLogs.length * 10) / 10
      : 0;

    const energyLogs = fitnessLogs.filter(l => l.energy_level != null);
    const avgEnergy = energyLogs.length > 0
      ? Math.round(energyLogs.reduce((s, l) => s + l.energy_level, 0) / energyLogs.length * 10) / 10
      : 0;

    // --- Top streaks ---
    const topStreaks = habits
      .filter(h => (h.current_streak || 0) > 0)
      .sort((a, b) => (b.current_streak || 0) - (a.current_streak || 0))
      .slice(0, 5)
      .map(h => ({ title: h.title, streak: h.current_streak }));

    // --- Life score avg + trend ---
    const thisWeekSnaps = await DailySnapshot.find({
      user_id: userId,
      date: { $gte: weekAgo, $lte: today }
    }).lean();
    const lastWeekSnaps = await DailySnapshot.find({
      user_id: userId,
      date: { $gte: twoWeeksAgo, $lt: weekAgo }
    }).lean();

    const lifeScoreAvg = thisWeekSnaps.length > 0
      ? Math.round(thisWeekSnaps.reduce((s, snap) => s + (snap.life_score || 0), 0) / thisWeekSnaps.length)
      : 0;
    const lastWeekAvg = lastWeekSnaps.length > 0
      ? Math.round(lastWeekSnaps.reduce((s, snap) => s + (snap.life_score || 0), 0) / lastWeekSnaps.length)
      : 0;
    const lifeScoreTrend = lifeScoreAvg - lastWeekAvg;

    // --- Insights ---
    const insights = [];
    const taskCompletionRate = tasksTotal > 0 ? tasksCompleted / tasksTotal : 0;
    if (taskCompletionRate > 0.8) insights.push('Strong task completion this week');
    if (taskCompletionRate < 0.5 && tasksTotal > 0) insights.push('Task completion needs attention — try breaking tasks smaller');
    if (habitsRate > 0.9) insights.push('Excellent habit consistency!');
    for (const h of habits) {
      if ((h.current_streak || 0) > 30) {
        insights.push(`Amazing! ${h.title} streak at ${h.current_streak} days`);
      }
    }
    if (avgSleep > 0 && avgSleep < 6) insights.push('Sleep is low — prioritize rest');
    if (exerciseDays < 3) insights.push('Try to exercise at least 3 days per week');
    if (focusHours > 20) insights.push(`Great focus week — ${focusHours} hours of deep work`);

    return {
      period: formatDateRange(weekAgo, today),
      tasksCompleted,
      tasksTotal,
      habitsRate,
      focusHours,
      exerciseDays,
      avgSleep,
      avgEnergy,
      topStreaks,
      lifeScoreAvg,
      lifeScoreTrend,
      insights
    };
  } catch (err) {
    console.error('Get weekly review error:', err);
    return null;
  }
});

// ============================================================================
// IPC HANDLERS — DAILY SNAPSHOT
// ============================================================================

ipcMain.handle('generate-snapshot', async () => {
  try {
    if (!currentUser) return null;
    const userId = currentUser._id.toString();
    const today = todayStr();

    // Tasks
    const allTasks = await Task.find({ creator_id: userId }).lean();
    const todayTasks = allTasks.filter(t => {
      const created = t.created_at ? new Date(t.created_at).toISOString().slice(0, 10) : '';
      return created === today || (t.due_date_utc && new Date(t.due_date_utc).toISOString().slice(0, 10) === today);
    });
    const tasks_completed = todayTasks.filter(t => t.status_id === 'done').length;
    const tasks_total = todayTasks.length;

    // Habits
    const habits = await Habit.find({ user_id: userId, is_active: true }).lean();
    const todayLogs = await HabitLog.find({ user_id: userId, date: today }).lean();
    const todayLogSet = new Set(todayLogs.map(l => l.habit_id.toString()));
    const dow = new Date().getDay();
    const dueHabits = habits.filter(h => {
      const freq = h.frequency && h.frequency.type ? h.frequency.type : 'daily';
      if (freq === 'daily') return true;
      if (freq === 'weekdays') return dow >= 1 && dow <= 5;
      if (freq === 'weekend') return dow === 0 || dow === 6;
      if (freq === 'custom') return (h.frequency.days || []).includes(dow);
      return true;
    });
    const habits_completed = dueHabits.filter(h => todayLogSet.has(h._id.toString())).length;
    const habits_total = dueHabits.length;

    // Focus
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const sessions = await FocusSession.find({
      user_id: userId,
      started_at: { $gte: todayStart }
    }).lean();
    const focus_minutes = Math.round(sessions.reduce((s, sess) => s + (sess.duration_actual_sec || 0), 0) / 60);

    // Fitness
    const fitnessLog = await FitnessLog.findOne({ user_id: userId, date: today }).lean();
    const exercise_minutes = fitnessLog && fitnessLog.workouts
      ? fitnessLog.workouts.reduce((s, w) => s + (w.duration_min || 0), 0)
      : 0;
    const sleep_hours = fitnessLog ? (fitnessLog.sleep_hours || 0) : 0;
    const energy_avg = fitnessLog ? (fitnessLog.energy_level || 0) : 0;
    const mood = fitnessLog ? (fitnessLog.mood || '') : '';

    // Career
    const careerLogs = await CareerLog.find({ user_id: userId, date: today }).lean();
    const career_minutes = careerLogs.reduce((s, l) => s + (l.duration_min || 0), 0);

    // Life score
    const life_score = await computeLifeScore(
      userId, today, tasks_completed, tasks_total,
      habits_completed, habits_total, fitnessLog, habits
    );

    const snapshot = await DailySnapshot.findOneAndUpdate(
      { user_id: userId, date: today },
      {
        user_id: userId,
        date: today,
        tasks_completed,
        tasks_total,
        habits_completed,
        habits_total,
        focus_minutes,
        exercise_minutes,
        sleep_hours,
        energy_avg,
        mood,
        life_score,
        career_minutes
      },
      { upsert: true, new: true }
    ).lean();

    return snapshot;
  } catch (err) {
    console.error('Generate snapshot error:', err);
    return null;
  }
});

// ============================================================================
// IPC HANDLERS — SMART ALERTS
// ============================================================================

// ============================================================================
// EMAIL ALERTS
// ============================================================================

function sendAlertEmail(subject, heading, bodyLines) {
  if (!currentUser || !currentUser.email) return;
  const bodyHtml = bodyLines.map(l => `<p style="margin:6px 0;color:#333;">${l}</p>`).join('');
  transporter.sendMail({
    from: `"NEXUS" <${process.env.EMAIL_USER}>`,
    to: currentUser.email,
    subject: `NEXUS — ${subject}`,
    html: `
      <div style="font-family:sans-serif;padding:24px;max-width:500px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:20px;">
          <span style="font-size:28px;font-weight:800;background:linear-gradient(135deg,#a896ff,#4fa3e8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">NEXUS</span>
        </div>
        <div style="background:#f8f8fb;border-radius:12px;padding:24px;border:1px solid #e8e8f0;">
          <h2 style="margin:0 0 12px;color:#7c6af7;font-size:18px;">${heading}</h2>
          ${bodyHtml}
        </div>
        <p style="text-align:center;margin-top:16px;font-size:11px;color:#999;">Sent by NEXUS — your daily life operating system</p>
      </div>
    `
  }).catch(e => console.error('Alert email failed:', e.message));
}

// Called from renderer when task timer completes
ipcMain.on('email-timer-done', (_e, { taskTitle }) => {
  sendAlertEmail(
    'Timer Complete',
    'Timer Finished!',
    [`Your timer for <strong>${taskTitle}</strong> has completed.`, 'Great work — take a short break or move on to your next task.']
  );
});

// Called from renderer when focus session completes
ipcMain.on('email-focus-done', (_e, { title, durationMin }) => {
  sendAlertEmail(
    'Focus Session Complete',
    'Deep Work Done!',
    [`You completed a <strong>${durationMin}-minute</strong> focus session on <strong>${title}</strong>.`, 'Consistency is key — keep it up!']
  );
});

// Daily summary email (triggered once per day on first smart alert check)
let dailySummarySent = null;

async function sendDailySummaryEmail(userId) {
  const today = todayStr();
  if (dailySummarySent === today) return;
  dailySummarySent = today;

  try {
    const [tasksDone, tasksTotal, habitsActive, habitsLogs, fitnessLog, careerLogs] = await Promise.all([
      Task.countDocuments({ creator_id: userId, status_id: 'done' }),
      Task.countDocuments({ creator_id: userId }),
      Habit.countDocuments({ user_id: userId, is_active: true }),
      HabitLog.find({ user_id: userId, date: today }).lean(),
      FitnessLog.findOne({ user_id: userId, date: today }).lean(),
      CareerLog.find({ user_id: userId, date: today }).lean()
    ]);

    const overdue = await Task.countDocuments({
      creator_id: userId,
      status_id: { $ne: 'done' },
      due_date_utc: { $lt: new Date(today + 'T00:00:00.000Z') }
    });

    const lines = [
      `<strong>Tasks:</strong> ${tasksDone}/${tasksTotal} completed`,
      `<strong>Habits:</strong> ${habitsLogs.length}/${habitsActive} done today`,
    ];
    if (fitnessLog) {
      lines.push(`<strong>Sleep:</strong> ${fitnessLog.sleep_hours || 0}h &nbsp; <strong>Water:</strong> ${fitnessLog.water_glasses || 0} glasses &nbsp; <strong>Energy:</strong> ${fitnessLog.energy_level || '-'}/10`);
    } else {
      lines.push(`<strong>Health:</strong> No check-in yet — don't forget to log your wellness!`);
    }
    if (careerLogs.length > 0) {
      const totalMin = careerLogs.reduce((sum, l) => sum + (l.duration_min || 0), 0);
      lines.push(`<strong>Career:</strong> ${careerLogs.length} activities, ${totalMin} minutes`);
    }
    if (overdue > 0) {
      lines.push(`<span style="color:#f06060;"><strong>⚠ ${overdue} overdue task${overdue > 1 ? 's' : ''}</strong> — review and reschedule!</span>`);
    }

    sendAlertEmail('Daily Summary', `Your Day — ${today}`, lines);
  } catch (e) {
    console.error('Daily summary email error:', e.message);
  }
}

// Missed habits evening email (called from check-alerts when habits are at risk)
function sendStreakRiskEmail(habitNames) {
  sendAlertEmail(
    'Streaks at Risk!',
    'Don\'t break your streaks!',
    [
      `These habits are not done yet today:`,
      ...habitNames.map(n => `• <strong>${n}</strong>`),
      `<br/>Open NEXUS and complete them before midnight!`
    ]
  );
}

async function hasAlertToday(userId, type) {
  const today = todayStr();
  const startOfDay = new Date(today + 'T00:00:00.000Z');
  const endOfDay = new Date(today + 'T23:59:59.999Z');
  const existing = await Notification.findOne({
    user_id: userId,
    type,
    created_at: { $gte: startOfDay, $lte: endOfDay }
  }).lean();
  return !!existing;
}

async function createAlert(userId, type, title, body, icon) {
  return Notification.create({
    user_id: userId,
    type,
    title,
    body,
    icon: icon || '',
    is_read: false,
    created_at: new Date()
  });
}

ipcMain.handle('check-alerts', async () => {
  try {
    if (!currentUser) return [];
    const userId = currentUser._id.toString();
    const today = todayStr();
    const newAlerts = [];

    // 1. Streak at risk (after 8pm)
    const currentHour = new Date().getHours();
    if (currentHour >= 20) {
      if (!(await hasAlertToday(userId, 'streak_warning'))) {
        const habits = await Habit.find({ user_id: userId, is_active: true }).lean();
        const todayLogs = await HabitLog.find({ user_id: userId, date: today }).lean();
        const loggedIds = new Set(todayLogs.map(l => l.habit_id.toString()));
        const dow = new Date().getDay();

        for (const h of habits) {
          const freq = h.frequency && h.frequency.type ? h.frequency.type : 'daily';
          let isDue = false;
          if (freq === 'daily') isDue = true;
          else if (freq === 'weekdays') isDue = dow >= 1 && dow <= 5;
          else if (freq === 'weekend') isDue = dow === 0 || dow === 6;
          else if (freq === 'custom') isDue = (h.frequency.days || []).includes(dow);

          if (isDue && !loggedIds.has(h._id.toString()) && (h.current_streak || 0) > 0) {
            const alert = await createAlert(
              userId, 'streak_warning',
              'Streak at risk!',
              `Your ${h.title} streak (${h.current_streak} days) is at risk! Complete it before midnight.`,
              h.icon
            );
            newAlerts.push(alert.toObject());
          }
        }

        // Send email for all at-risk habits
        const atRiskNames = habits
          .filter(h => {
            const freq = h.frequency && h.frequency.type ? h.frequency.type : 'daily';
            let isDue = freq === 'daily' || (freq === 'weekdays' && dow >= 1 && dow <= 5) || (freq === 'weekend' && (dow === 0 || dow === 6)) || (freq === 'custom' && (h.frequency.days || []).includes(dow));
            return isDue && !loggedIds.has(h._id.toString()) && (h.current_streak || 0) > 0;
          })
          .map(h => `${h.icon || '🔄'} ${h.title} (${h.current_streak} days)`);
        if (atRiskNames.length > 0) sendStreakRiskEmail(atRiskNames);
      }
    }

    // Send daily summary email (once per day, triggered on first alert check)
    sendDailySummaryEmail(userId);

    // 2. No coding in 3 days
    if (!(await hasAlertToday(userId, 'smart_alert'))) {
      const threeDaysAgo = daysAgoStr(3);
      const recentCareer = await CareerLog.findOne({
        user_id: userId,
        date: { $gte: threeDaysAgo }
      }).lean();
      if (!recentCareer) {
        const alert = await createAlert(
          userId, 'smart_alert',
          'Coding reminder',
          "You haven't practiced coding in 3 days. Even 15 minutes helps!",
          ''
        );
        newAlerts.push(alert.toObject());
      }
    }

    // 3. Sleep deteriorating
    if (!(await hasAlertToday(userId, 'burnout'))) {
      const recentFitness = await FitnessLog.find({
        user_id: userId,
        date: { $gte: daysAgoStr(3) }
      }).sort({ date: -1 }).limit(3).lean();

      if (recentFitness.length === 3 && recentFitness.every(f => (f.sleep_hours || 0) < 6)) {
        const alert = await createAlert(
          userId, 'burnout',
          'Sleep alert',
          'Your sleep has been under 6 hours for 3 days. Consider an earlier bedtime.',
          ''
        );
        newAlerts.push(alert.toObject());
      }
    }

    // 4. Overdue tasks
    if (!(await hasAlertToday(userId, 'reminder'))) {
      const overdue = await Task.find({
        creator_id: userId,
        status_id: { $ne: 'done' },
        due_date_utc: { $lt: new Date(today + 'T00:00:00.000Z') }
      }).lean();

      if (overdue.length > 0) {
        const alert = await createAlert(
          userId, 'reminder',
          'Overdue tasks',
          `You have ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}. Review and reschedule them.`,
          ''
        );
        newAlerts.push(alert.toObject());
      }
    }

    // 5. Goal deadline approaching
    if (!(await hasAlertToday(userId, 'goal_progress'))) {
      const goals = await Goal.find({
        user_id: userId,
        status: 'active',
        target_date: { $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
      }).lean();

      for (const g of goals) {
        if ((g.progress_pct || 0) < 70) {
          const daysLeft = Math.ceil((new Date(g.target_date) - new Date()) / (1000 * 60 * 60 * 24));
          if (daysLeft >= 0) {
            const alert = await createAlert(
              userId, 'goal_progress',
              'Goal deadline approaching',
              `${g.title} is due in ${daysLeft} days but only ${g.progress_pct || 0}% done.`,
              ''
            );
            newAlerts.push(alert.toObject());
          }
        }
      }
    }

    // 6. Burnout detection (10+ hours focus for 3 days)
    if (!(await hasAlertToday(userId, 'burnout'))) {
      const recentSnaps = await DailySnapshot.find({
        user_id: userId,
        date: { $gte: daysAgoStr(3) }
      }).sort({ date: -1 }).limit(3).lean();

      if (recentSnaps.length === 3 && recentSnaps.every(s => (s.focus_minutes || 0) > 600)) {
        const alert = await createAlert(
          userId, 'burnout',
          'Burnout warning',
          "You've been working 10+ hours for 3 days straight. Take a break.",
          ''
        );
        newAlerts.push(alert.toObject());
      }
    }

    // 7. Time debt (deferred tasks)
    if (!(await hasAlertToday(userId, 'time_debt'))) {
      const deferredTasks = await Task.find({
        creator_id: userId,
        status_id: { $ne: 'done' },
        deferred_count: { $gte: 3 }
      }).lean();

      for (const t of deferredTasks) {
        const alert = await createAlert(
          userId, 'time_debt',
          'Repeatedly deferred task',
          `You've deferred '${t.title}' ${t.deferred_count} times. Break it into smaller steps?`,
          ''
        );
        newAlerts.push(alert.toObject());
      }
    }

    // 8. Achievement milestones
    if (!(await hasAlertToday(userId, 'achievement'))) {
      const milestoneValues = [7, 14, 30, 60, 90, 365];
      const habits = await Habit.find({ user_id: userId, is_active: true }).lean();

      for (const h of habits) {
        const streak = h.current_streak || 0;
        if (milestoneValues.includes(streak)) {
          const alert = await createAlert(
            userId, 'achievement',
            'Streak milestone!',
            `\u{1F389} ${streak}-day streak on ${h.title}!`,
            h.icon
          );
          newAlerts.push(alert.toObject());
        }
      }
    }

    return newAlerts;
  } catch (err) {
    console.error('Check alerts error:', err);
    return [];
  }
});

// ============================================================================
// APP MENU
// ============================================================================

function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    {
      label: 'NEXUS',
      submenu: [
        {
          label: 'About NEXUS',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About NEXUS',
              message: 'NEXUS — Daily Life Operating System',
              detail: 'Your all-in-one productivity and life management tool.'
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: isMac ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => { app.isQuitting = true; app.quit(); }
        }
      ]
    },
    {
      label: 'Tasks',
      submenu: [
        {
          label: 'New Task',
          accelerator: isMac ? 'Cmd+N' : 'Ctrl+N',
          click: () => { mainWindow.webContents.send('menu-new-task'); }
        },
        {
          label: 'Search',
          accelerator: isMac ? 'Cmd+F' : 'Ctrl+F',
          click: () => { mainWindow.webContents.send('menu-search'); }
        },
        { type: 'separator' },
        {
          label: 'Export',
          accelerator: isMac ? 'Cmd+E' : 'Ctrl+E',
          click: () => { mainWindow.webContents.send('menu-export'); }
        },
        {
          label: 'Import',
          accelerator: isMac ? 'Cmd+I' : 'Ctrl+I',
          click: () => { mainWindow.webContents.send('menu-import'); }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => { mainWindow.webContents.toggleDevTools(); }
        },
        {
          label: 'Reload',
          accelerator: isMac ? 'Cmd+R' : 'Ctrl+R',
          click: () => { mainWindow.reload(); }
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: isMac ? 'Cmd+=' : 'Ctrl+=',
          click: () => {
            const level = mainWindow.webContents.getZoomLevel();
            mainWindow.webContents.setZoomLevel(level + 0.5);
          }
        },
        {
          label: 'Zoom Out',
          accelerator: isMac ? 'Cmd+-' : 'Ctrl+-',
          click: () => {
            const level = mainWindow.webContents.getZoomLevel();
            mainWindow.webContents.setZoomLevel(level - 0.5);
          }
        },
        {
          label: 'Reset Zoom',
          accelerator: isMac ? 'Cmd+0' : 'Ctrl+0',
          click: () => { mainWindow.webContents.setZoomLevel(0); }
        }
      ]
    }
  ];

  return Menu.buildFromTemplate(template);
}

// ============================================================================
// APP LIFECYCLE
// ============================================================================

app.whenReady().then(() => {
  Menu.setApplicationMenu(buildAppMenu());
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  } else {
    createWindow();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
