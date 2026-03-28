const mongoose = require('mongoose');

const FocusSessionSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  task_id: { type: String },
  title: { type: String, required: true },
  category: { type: String, default: 'general' },
  duration_planned_sec: { type: Number, required: true },
  duration_actual_sec: { type: Number, default: 0 },
  completed: { type: Boolean, default: false },
  distractions: { type: Number, default: 0 },
  started_at: { type: Date, default: Date.now },
  ended_at: { type: Date }
});

module.exports = mongoose.model('FocusSession', FocusSessionSchema);
