const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  // --- 1. CORE IDENTITY (1-10) ---
  task_id: { type: String, unique: true, required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  slug: { type: String, lowercase: true },
  version: { type: Number, default: 1 },
  is_template: { type: Boolean, default: false },
  template_source_id: { type: String },
  task_type: { type: String, enum: ['standard', 'milestone', 'epic', 'bug'], default: 'standard' },
  language_code: { type: String, default: 'en-IN' },
  display_order: { type: Number, default: 0 },

  // --- 2. STATUS & PROGRESS (11-20) ---
  status_id: { type: String, default: 'todo' }, 
  status_label: { type: String, default: 'To Do' },
  completion_percentage: { type: Number, min: 0, max: 100, default: 0 },
  is_active: { type: Boolean, default: true },
  is_archived: { type: Boolean, default: false },
  is_deleted: { type: Boolean, default: false },
  is_flagged: { type: Boolean, default: false },
  is_blocked: { type: Boolean, default: false },
  blocker_reason: { type: String },
  resolution_type: { type: String }, 

  // --- 3. PRIORITIZATION (21-30) ---
  priority_level: { type: String, enum: ['urgent', 'high', 'normal', 'low'], default: 'normal' },
  priority_score: { type: Number, default: 50 }, 
  urgency_score: { type: Number, default: 0 },
  impact_score: { type: Number, default: 0 },
  stakeholder_value: { type: Number, default: 0 },
  risk_factor: { type: Number, default: 0 },
  confidence_level: { type: Number, default: 100 },
  effort_points: { type: Number, default: 0 }, 
  t_shirt_size: { type: String, enum: ['XS', 'S', 'M', 'L', 'XL'] },
  priority_color_hex: { type: String, default: '#7c6af7' },

  // --- 4. TIMING & DEADLINES (31-45) ---
  due_date_utc: { type: Date },
  start_date_utc: { type: Date },
  completion_date_utc: { type: Date },
  overdue_threshold_sec: { type: Number, default: 0 },
  reminder_alert_at: { type: Date },
  grace_period_days: { type: Number, default: 0 },
  is_overdue: { type: Boolean, default: false },
  estimated_duration_sec: { type: Number, default: 3600 }, 
  actual_duration_sec: { type: Number, default: 0 },
  duration_variance_pct: { type: Number, default: 0 },
  timezone_offset: { type: Number, default: 330 }, 
  timezone_id: { type: String, default: 'Asia/Kolkata' },
  business_days_only: { type: Boolean, default: true },
  hard_deadline: { type: Boolean, default: false },
  auto_lock_on_due: { type: Boolean, default: false },

  // --- 5. TIMER & POMODORO (46-55) ---
  timer_is_running: { type: Boolean, default: false },
  timer_last_started_at: { type: Date },
  timer_accumulated_sec: { type: Number, default: 0 },
  timer_remaining_sec: { type: Number, default: 0 },
  pomodoro_sessions_total: { type: Number, default: 0 },
  pomodoro_target_count: { type: Number, default: 4 },
  break_duration_sec: { type: Number, default: 300 },
  idle_time_detected_sec: { type: Number, default: 0 },
  last_timer_session_id: { type: String },
  focus_state_active: { type: Boolean, default: false },

  // --- 6. RECURRENCE ENGINE (56-65) ---
  is_recurring: { type: Boolean, default: false },
  recurrence_pattern: { type: String }, 
  recurrence_interval: { type: Number, default: 1 },
  recurrence_end_date: { type: Date },
  recurrence_skip_count: { type: Number, default: 0 },
  recurrence_day_of_week: [Number],
  recurrence_day_of_month: [Number],
  auto_generate_next: { type: Boolean, default: true },
  last_generated_at: { type: Date },
  next_occurrence_at: { type: Date },

  // --- 7. WORKSPACE & HIERARCHY (66-75) ---
  workspace_id: { type: String, required: true },
  workspace_name: { type: String },
  project_id: { type: String },
  folder_id: { type: String },
  parent_task_id: { type: String },
  is_parent: { type: Boolean, default: false },
  subtask_count: { type: Number, default: 0 },
  deep_link_url: { type: String },
  client_id: { type: String },
  billing_category: { type: String },

  // --- 8. USERS & OWNERSHIP (76-85) ---
  creator_id: { type: String },
  owner_id: { type: String },
  assignee_ids: [{ type: String }],
  reviewer_id: { type: String },
  collaborator_ids: [{ type: String }],
  follower_ids: [{ type: String }],
  visibility_level: { type: String, enum: ['private', 'team', 'public'], default: 'private' },
  access_role_required: { type: String },
  last_modified_by: { type: String },
  assigned_at: { type: Date },

  // --- 9. SUBTASKS & CHECKLIST (86-90) ---
  checklist_items: [{
    id: String,
    label: String,
    is_done: Boolean,
    order: Number,
    completed_at: Date
  }],
  dependency_task_ids: [{ type: String }],
  is_blocking_others: { type: Boolean, default: false },

  // --- 10. MEDIA & ASSETS (91-95) ---
  attachment_ids: [{ type: String }],
  media_count: { type: Number, default: 0 },
  cover_image_url: { type: String },
  is_attachment_required: { type: Boolean, default: false },
  external_source_name: { type: String }, 

  // --- 11. ANALYTICS & AI (96-105) ---
  difficulty_score: { type: Number, default: 0 },
  focus_index: { type: Number, default: 0 },
  sentimentScore: { type: Number, default: 0 },
  predicted_completion_at: { type: Date },
  ai_tags: [String],
  search_v_vector: [Number], 
  interaction_count: { type: Number, default: 0 },
  time_efficiency_ratio: { type: Number, default: 0 },
  is_outlier: { type: Boolean, default: false },
  energy_requirement: { type: String, enum: ['low', 'medium', 'high'] },

  // --- 12A. NEXUS OS EXTENSIONS ---
  category: { type: String, default: 'personal' },
  source_goal_id: { type: String, default: '' },
  deferred_count: { type: Number, default: 0 },

  // --- 12. METADATA & AUDIT (106-110) ---
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  archived_at: { type: Date },
  edit_session_ids: [String],
  app_version_origin: { type: String, default: '1.0.0' }
});

module.exports = mongoose.model('Task', TaskSchema);
