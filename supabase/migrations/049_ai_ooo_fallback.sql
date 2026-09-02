-- ============================================================
-- 049_ai_ooo_fallback.sql — AI Out of Office Fallback
--
-- Adds business hours configuration directly to ai_configs so the AI
-- can send a fallback message if it decides to handoff outside of
-- business hours.
-- ============================================================

ALTER TABLE public.ai_configs
  ADD COLUMN ooo_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN ooo_timezone TEXT,
  ADD COLUMN ooo_working_days INT[],
  ADD COLUMN ooo_start_time TEXT,
  ADD COLUMN ooo_end_time TEXT,
  ADD COLUMN ooo_fallback_message TEXT;
