-- ============================================================
-- 044: Deals Follow-up Reminders
-- Adds follow_up_at column to deals for Nurture pipeline stage.
-- Adds nurture_suggestion to conversations to persist AI detected deferral intent.
-- ============================================================

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_deals_follow_up_at
  ON deals(follow_up_at) WHERE follow_up_at IS NOT NULL AND status = 'open';

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS nurture_suggestion JSONB;
