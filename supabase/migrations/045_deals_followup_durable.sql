-- ============================================================
-- DURABLE NURTURE REMINDERS
-- ============================================================

ALTER TABLE deals
ADD COLUMN IF NOT EXISTS follow_up_claimed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS follow_up_notified_at TIMESTAMPTZ;

-- Index for cron sweeps
CREATE INDEX IF NOT EXISTS idx_deals_followup_cron 
ON deals(follow_up_at) 
WHERE status = 'open' AND follow_up_notified_at IS NULL;

-- ============================================================
-- ATOMIC FOLLOW-UP NOTIFICATION
-- ============================================================
CREATE OR REPLACE FUNCTION process_due_follow_up(p_deal_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deal deals%ROWTYPE;
  v_assigned_agent_id UUID;
  v_conversation_id UUID;
  v_contact_name TEXT;
BEGIN
  -- Attempt to claim and verify not already notified
  SELECT * INTO v_deal FROM deals 
  WHERE id = p_deal_id 
    AND follow_up_notified_at IS NULL
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- fetch conversation details
  SELECT id, assigned_agent_id INTO v_conversation_id, v_assigned_agent_id
  FROM conversations
  WHERE (id = v_deal.conversation_id) 
     OR (contact_id = v_deal.contact_id AND account_id = v_deal.account_id AND status = 'open')
  ORDER BY status = 'open' DESC
  LIMIT 1;

  -- fetch contact name
  SELECT name INTO v_contact_name FROM contacts WHERE id = v_deal.contact_id;

  -- create notification exactly once
  INSERT INTO notifications (
    account_id,
    user_id,
    type,
    conversation_id,
    contact_id,
    title,
    body,
    read_at
  ) VALUES (
    v_deal.account_id,
    COALESCE(v_assigned_agent_id, v_deal.user_id),
    'conversation_assigned',
    v_conversation_id,
    v_deal.contact_id,
    'Follow-up reminder',
    'Follow up with ' || COALESCE(v_contact_name, 'Contact'),
    NULL
  );

  -- mark as notified (which permanently removes it from the cron's view)
  UPDATE deals 
  SET follow_up_notified_at = NOW(), 
      follow_up_claimed_at = NULL 
  WHERE id = p_deal_id;

  RETURN TRUE;
END;
$$;
