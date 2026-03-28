const mongoose = require('mongoose');

const CareerLogSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  date: { type: String, required: true },
  type: { type: String, enum: ['dsa', 'learning', 'project', 'interview_prep'], default: 'learning' },
  title: { type: String, required: true },
  platform: { type: String, default: '' },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard', ''], default: '' },
  duration_min: { type: Number, default: 0 },
  skill_tags: [String],
  notes: { type: String, default: '' },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CareerLog', CareerLogSchema);
