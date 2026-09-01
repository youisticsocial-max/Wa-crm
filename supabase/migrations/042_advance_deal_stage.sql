-- ============================================================
-- RPC: advance_deal_stage_safely
-- Purpose: Safely moves an active deal forward in a pipeline.
-- It resolves pipeline and stages by name to avoid hardcoded UUIDs,
-- prevents backward movement, prevents mutating Won/Lost deals,
-- and safely no-ops if no active deal exists.
-- ============================================================

CREATE OR REPLACE FUNCTION advance_deal_stage_safely(
  p_account_id UUID,
  p_contact_id UUID,
  p_pipeline_name TEXT,
  p_target_stage_name TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_pipeline_id UUID;
  v_deal_id UUID;
  v_current_stage_id UUID;
  v_current_position INT;
  v_target_stage_id UUID;
  v_target_position INT;
BEGIN
  -- 1. Find the pipeline by name
  SELECT id INTO v_pipeline_id
  FROM pipelines
  WHERE account_id = p_account_id AND name = p_pipeline_name
  LIMIT 1;

  IF v_pipeline_id IS NULL THEN
    RETURN;
  END IF;

  -- 2. Find the target stage and its position
  SELECT id, position INTO v_target_stage_id, v_target_position
  FROM pipeline_stages
  WHERE pipeline_id = v_pipeline_id AND name = p_target_stage_name
  LIMIT 1;

  IF v_target_stage_id IS NULL THEN
    RETURN;
  END IF;

  -- 3. Find the active deal for this contact in this pipeline
  -- Active means not won or lost. If there are multiple, we pick the most recently updated one.
  SELECT id, stage_id INTO v_deal_id, v_current_stage_id
  FROM deals
  WHERE account_id = p_account_id
    AND pipeline_id = v_pipeline_id
    AND contact_id = p_contact_id
    AND status NOT IN ('won', 'lost')
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_deal_id IS NULL THEN
    -- No active deal exists. Safely no-op per requirements.
    RETURN;
  END IF;

  -- If the deal is already in the target stage, we can just return.
  IF v_current_stage_id = v_target_stage_id THEN
    RETURN;
  END IF;

  -- 4. Get the position of the current stage
  SELECT position INTO v_current_position
  FROM pipeline_stages
  WHERE id = v_current_stage_id
  LIMIT 1;

  -- If current stage not found (shouldn't happen with FKs but be safe)
  IF v_current_position IS NULL THEN
    RETURN;
  END IF;

  -- 5. Only advance FORWARD. (Higher position means further along in the pipeline).
  IF v_target_position > v_current_position THEN
    UPDATE deals
    SET stage_id = v_target_stage_id,
        updated_at = NOW()
    WHERE id = v_deal_id;
  END IF;

END;
$$;
