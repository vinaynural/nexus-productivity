const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  // --- AUTH ENTITY ---
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  password_hash: { type: String, required: true },
  first_name: { type: String, required: true },
  last_name: { type: String },
  display_name: { type: String },
  profile_image_url: { type: String, default: "" },

  // --- ACCOUNT SETTINGS ---
  workspace_ids: [{ type: String }],
  default_workspace: { type: String, default: 'personal' },
  language: { type: String, default: 'en' },
  timezone: { type: String, default: 'UTC' },
  dark_mode: { type: Boolean, default: true },
  wake_time: { type: String, default: '07:00' },
  sleep_time: { type: String, default: '23:00' },
  energy_pattern: { type: String, enum: ['morning', 'evening', 'steady'], default: 'morning' },
  
  // --- SUBSCRIPTION & STATUS ---
  membership_tier: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
  is_active: { type: Boolean, default: true },
  is_email_verified: { type: Boolean, default: false },
  last_login_at: { type: Date },
  
  // --- VERIFICATION ---
  otp_code: { type: String },
  otp_expires: { type: Date },
  is_verified: { type: Boolean, default: false },
  
  // --- SECURITY ---
  failed_login_attempts: { type: Number, default: 0 },
  otp_secret: { type: String },
  recovery_email: { type: String },
  mfa_enabled: { type: Boolean, default: false },

  // --- ANALYTICS ---
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  total_tasks_created: { type: Number, default: 0 },
  total_tasks_completed: { type: Number, default: 0 }
});

module.exports = mongoose.model('User', UserSchema);
