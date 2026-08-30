-- Migration 037: Atomic replacement of automation steps
--
-- Migration 006 introduced automation_steps. Updating steps from the builder UI
-- performed a non-atomic DELETE followed by INSERT in application code.
-- Under concurrent load, an incoming webhook triggering an automation during the
-- deletion window found 0 steps, recording an empty success run.
--
-- This function executes both the DELETE and INSERT inside a single atomic Postgres transaction.

create or replace function replace_automation_steps(
  p_automation_id uuid,
  p_steps        jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from automation_steps where automation_id = p_automation_id;

  if p_steps is not null and jsonb_array_length(p_steps) > 0 then
    insert into automation_steps (
      id,
      automation_id,
      parent_step_id,
      branch,
      step_type,
      step_config,
      position
    )
    select
      (elem->>'id')::uuid,
      p_automation_id,
      nullif(elem->>'parent_step_id', '')::uuid,
      (elem->>'branch')::text,
      elem->>'step_type',
      (elem->'step_config'),
      (elem->>'position')::int
    from jsonb_array_elements(p_steps) as elem;
  end if;
end;
$$;
