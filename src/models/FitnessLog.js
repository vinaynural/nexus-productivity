const mongoose = require('mongoose');

const FitnessLogSchema = new mongoose.Schema({
  user_id: { type: String, required: true },
  date: { type: String, required: true },
  workouts: [{
    workout_type: String,
    name: String,
    duration_min: Number,
    calories_est: Number,
    notes: String
  }],
  sleep_hours: { type: Number, default: 0 },
  water_glasses: { type: Number, default: 0 },
  steps: { type: Number, default: 0 },
  weight_kg: { type: Number },
  energy_level: { type: Number, min: 1, max: 10 },
  mood: { type: String, enum: ['great', 'good', 'okay', 'low', 'bad'] },
  notes: { type: String, default: '' },
  created_at: { type: Date, default: Date.now }
});

FitnessLogSchema.index({ user_id: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('FitnessLog', FitnessLogSchema);
