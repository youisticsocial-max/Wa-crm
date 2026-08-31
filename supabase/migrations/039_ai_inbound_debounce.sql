-- Durable, per-conversation debounce state for AI auto-replies.
-- Each eligible inbound advances a version and moves the due time forward.
-- Only the waiter holding the latest version can atomically claim dispatch.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_reply_pending_version bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_reply_claimed_version bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_reply_due_at timestamptz;

CREATE OR REPLACE FUNCTION public.schedule_ai_reply_dispatch(
  target_conversation_id uuid,
  debounce_milliseconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_version bigint;
  next_due_at timestamptz;
BEGIN
  UPDATE conversations
  SET
    ai_reply_pending_version = ai_reply_pending_version + 1,
    ai_reply_due_at = clock_timestamp()
      + make_interval(secs => GREATEST(debounce_milliseconds, 0)::double precision / 1000.0)
  WHERE id = target_conversation_id
  RETURNING ai_reply_pending_version, ai_reply_due_at
  INTO next_version, next_due_at;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'version', next_version,
    'due_at', next_due_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_ai_reply_dispatch(
  target_conversation_id uuid,
  expected_version bigint
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH claimed AS (
    UPDATE conversations
    SET
      ai_reply_claimed_version = expected_version,
      ai_reply_due_at = NULL
    WHERE id = target_conversation_id
      AND ai_reply_pending_version = expected_version
      AND ai_reply_claimed_version < expected_version
      AND ai_reply_due_at <= clock_timestamp()
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM claimed);
$$;

CREATE OR REPLACE FUNCTION public.cancel_ai_reply_dispatch(
  target_conversation_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE conversations
  SET
    ai_reply_pending_version = ai_reply_pending_version + 1,
    ai_reply_due_at = NULL
  WHERE id = target_conversation_id;
$$;

-- The legacy counter remains for compatibility and operational visibility,
-- but no longer gates normal conversations. Count only completed sends.
CREATE OR REPLACE FUNCTION public.record_ai_reply_sent(
  target_conversation_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE conversations
  SET ai_reply_count = ai_reply_count + 1
  WHERE id = target_conversation_id;
$$;

REVOKE ALL ON FUNCTION public.schedule_ai_reply_dispatch(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_ai_reply_dispatch(uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_ai_reply_dispatch(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_ai_reply_sent(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.schedule_ai_reply_dispatch(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_ai_reply_dispatch(uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_ai_reply_dispatch(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_ai_reply_sent(uuid) TO service_role;
