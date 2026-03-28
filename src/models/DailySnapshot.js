const mongoose = require('mongoose');

const DailySnapshotSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  date: { type: String, required: true },
  tasks_completed: { type: Number, default: 0 },
  tasks_total: { type: Number, default: 0 },
  habits_completed: { type: Number, default: 0 },
  habits_total: { type: Number, default: 0 },
  focus_minutes: { type: Number, default: 0 },
  exercise_minutes: { type: Number, default: 0 },
  sleep_hours: { type: Number, default: 0 },
  energy_avg: { type: Number, default: 5 },
  mood: { type: String, default: 'okay' },
  life_score: { type: Number, default: 50 },
  career_minutes: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

DailySnapshotSchema.index({ user_id: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailySnapshot', DailySnapshotSchema);
