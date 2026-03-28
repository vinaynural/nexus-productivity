const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  type: { type: String, enum: ['reminder', 'streak_warning', 'achievement', 'burnout', 'time_debt', 'smart_alert', 'goal_progress'], default: 'reminder' },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  icon: { type: String, default: '🔔' },
  is_read: { type: Boolean, default: false },
  action_view: { type: String, default: '' },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', NotificationSchema);
