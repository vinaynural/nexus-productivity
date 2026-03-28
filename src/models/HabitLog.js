const mongoose = require('mongoose');

const HabitLogSchema = new mongoose.Schema({
  habit_id: { type: String, required: true },
  user_id: { type: String, required: true },
  date: { type: String, required: true },
  completed: { type: Boolean, default: true },
  completed_at: { type: Date, default: Date.now }
});

HabitLogSchema.index({ habit_id: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('HabitLog', HabitLogSchema);
