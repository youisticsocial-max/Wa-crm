-- ============================================================
-- Add negotiation_suggestion to conversations
-- ============================================================

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS negotiation_suggestion JSONB;
