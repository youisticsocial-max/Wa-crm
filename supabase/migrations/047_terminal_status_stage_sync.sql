-- ============================================================
-- RPC: resolve_deal_terminal_state
-- Purpose: Atomically updates a deal's status and stage_id 
-- when marking it as 'won' or 'lost'. It safely resolves the 
-- target stage dynamically from the deal's current pipeline.
-- ============================================================

CREATE OR REPLACE FUNCTION resolve_deal_terminal_state(
  p_deal_id UUID,
  p_target_status TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_pipeline_id UUID;
  v_target_stage_id UUID;
  v_target_stage_name TEXT;
  v_current_status TEXT;
BEGIN
  IF p_target_status NOT IN ('won', 'lost') THEN
    RAISE EXCEPTION 'Target status must be won or lost';
  END IF;

  IF p_target_status = 'won' THEN
    v_target_stage_name := 'Won';
  ELSE
    v_target_stage_name := 'Lost';
  END IF;

  -- 1. Find the pipeline of the deal
  SELECT pipeline_id, status INTO v_pipeline_id, v_current_status
  FROM deals
  WHERE id = p_deal_id;

  IF v_pipeline_id IS NULL THEN
    RETURN; -- safely no-op
  END IF;

  -- 2. Find the target stage in the SAME pipeline
  SELECT id INTO v_target_stage_id
  FROM pipeline_stages
  WHERE pipeline_id = v_pipeline_id
    AND name = v_target_stage_name
  LIMIT 1;

  IF v_target_stage_id IS NULL THEN
    -- Fallback: fail safely if stage doesn't exist
    RAISE EXCEPTION 'Terminal stage "%" not found for pipeline %', v_target_stage_name, v_pipeline_id;
  END IF;

  -- 3. Atomic update
  UPDATE deals
  SET status = p_target_status,
      stage_id = v_target_stage_id,
      updated_at = NOW()
  WHERE id = p_deal_id;
END;
$$;
