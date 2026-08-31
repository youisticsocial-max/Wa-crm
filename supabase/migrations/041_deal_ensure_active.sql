-- ============================================================
-- RPC: ensure_active_deal
-- Purpose: Concurrency-safe, duplicate-safe deal creation and updating.
-- If an active deal (status NOT IN ('won', 'lost')) exists for the given
-- account, pipeline, and contact, it updates its conversation_id and returns it.
-- Otherwise, it creates a new one and returns it.
-- ============================================================

CREATE OR REPLACE FUNCTION ensure_active_deal(
  p_account_id UUID,
  p_user_id UUID,
  p_pipeline_id UUID,
  p_stage_id UUID,
  p_contact_id UUID,
  p_conversation_id UUID,
  p_title TEXT,
  p_value NUMERIC,
  p_currency TEXT
) RETURNS TABLE (
  deal_id UUID,
  is_new BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_deal_id UUID;
BEGIN
  -- We use an advisory lock specific to the contact and pipeline
  -- to serialize concurrent requests, preventing race conditions
  -- where two inbound messages trigger simultaneous creations.
  -- pg_advisory_xact_lock automatically releases at transaction end.
  -- We hash the account, pipeline, and contact IDs to an integer lock key.
  PERFORM pg_advisory_xact_lock(
    hashtext(p_account_id::text || p_pipeline_id::text || p_contact_id::text)
  );

  -- 1. Try to find an existing active deal
  SELECT id INTO v_deal_id
  FROM deals
  WHERE account_id = p_account_id
    AND pipeline_id = p_pipeline_id
    AND contact_id = p_contact_id
    AND status NOT IN ('won', 'lost')
  LIMIT 1;

  IF FOUND THEN
    -- Update the conversation link to the most recent one (if provided)
    IF p_conversation_id IS NOT NULL THEN
      UPDATE deals
      SET conversation_id = p_conversation_id,
          updated_at = NOW()
      WHERE id = v_deal_id;
    END IF;

    RETURN QUERY SELECT v_deal_id, false;
    RETURN;
  END IF;

  -- 2. No active deal found, create a new one
  INSERT INTO deals (
    account_id,
    user_id,
    pipeline_id,
    stage_id,
    contact_id,
    conversation_id,
    title,
    value,
    currency,
    status
  ) VALUES (
    p_account_id,
    p_user_id,
    p_pipeline_id,
    p_stage_id,
    p_contact_id,
    p_conversation_id,
    p_title,
    p_value,
    COALESCE(p_currency, 'USD'),
    'open'
  )
  RETURNING id INTO v_deal_id;

  RETURN QUERY SELECT v_deal_id, true;
END;
$$;
