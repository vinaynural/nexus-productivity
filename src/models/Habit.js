const mongoose = require('mongoose');

const HabitSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  title: { type: String, required: true },
  icon: { type: String, default: '🔄' },
  category: { type: String, enum: ['fitness', 'career', 'personal', 'health'], default: 'personal' },
  frequency: {
    type: { type: String, enum: ['daily', 'weekdays', 'weekend', 'custom'], default: 'daily' },
    days: [Number]
  },
  reminder_time: { type: String, default: '' },
  current_streak: { type: Number, default: 0 },
  longest_streak: { type: Number, default: 0 },
  total_completions: { type: Number, default: 0 },
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Habit', HabitSchema);
