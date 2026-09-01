-- ============================================================
-- Add terminal_suggestion to conversations
-- ============================================================

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS terminal_suggestion JSONB;

CREATE OR REPLACE FUNCTION trg_clear_conversation_suggestions_on_terminal_deal()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('won', 'lost') AND (OLD.status IS NULL OR OLD.status NOT IN ('won', 'lost')) THEN
    UPDATE conversations
    SET 
      negotiation_suggestion = NULL,
      nurture_suggestion = NULL,
      terminal_suggestion = NULL
    WHERE contact_id = NEW.contact_id
      AND account_id = NEW.account_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clear_conversation_suggestions_on_terminal_deal
AFTER UPDATE OF status ON deals
FOR EACH ROW
EXECUTE FUNCTION trg_clear_conversation_suggestions_on_terminal_deal();
