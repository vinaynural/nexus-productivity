const mongoose = require('mongoose');

const GoalSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  category: { type: String, enum: ['career', 'fitness', 'personal', 'learning'], default: 'personal' },
  target_date: { type: Date },
  progress_pct: { type: Number, default: 0 },
  milestones: [{
    id: String,
    title: String,
    target: Number,
    current: { type: Number, default: 0 },
    unit: String,
    completed: { type: Boolean, default: false }
  }],
  status: { type: String, enum: ['active', 'completed', 'abandoned'], default: 'active' },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Goal', GoalSchema);
