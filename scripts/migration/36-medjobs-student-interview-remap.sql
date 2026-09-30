-- ===========================================================================
-- 36 — remap stored rung positions after the students ladder was reordered
-- ===========================================================================
-- A task row stores payload.step: the rung's INDEX in its ladder, not its
-- name. Reordering the ladder therefore silently repoints every task already
-- written. Nothing errors. A task written as "step 0, complete their
-- application" simply comes back reading "step 0, reach out to them", and
-- the only symptom is students appearing to be somewhere they are not.
--
-- RUN THIS IN THE SAME DEPLOY AS THE CODE. Between the two, every student
-- record is pointing at the old ladder.
--
-- The students ladder was rewritten on 30 September to match the process the
-- team actually runs. It opened with "Complete their application" and put
-- the meeting third, on the assumption that a student finishes their
-- application and we then talk to them. The reverse happens every time: an
-- incomplete application lands, we reach out, we hold a call, take notes and
-- ask how they found us, and the application is finished afterwards, usually
-- with our help. Nobody has yet completed one before the call.
--
--   was                             now
--   ------------------------------  ---------------------------------------
--                                   0 Reach out to them            (new)
--                                   1 Schedule the interview       (new)
--   2 Meeting with the student    → 2 Hold the interview           (renamed)
--   0 Complete their application  → 3
--   1 Qualify their application   → 4
--   3 Get them an interview       → 5 Get them a provider interview (renamed)
--   4 Confirm hire                → 6
--   5 Mentor student              → 7
--   6 Confirm hours worked        → 8
--   7 the errand branch           → 9
--
-- Step 2 is a fixed point: the old meeting rung and the new interview rung
-- are the same conversation, so a task sitting on it does not move.
--
-- Unlike 33, this touches business_profile_tasks and not
-- student_outreach_tasks. Student tasks moved to the polymorphic table in
-- migration 075; a student is a business_profile, not a student_outreach row.
--
-- Safe to run twice. Each remapped row is stamped "v36" and skipped on a
-- second pass. Without the stamp the sets overlap — 0 becomes 3, then 3
-- becomes 5 — and the damage is invisible until somebody notices students
-- skipping rungs. Proved by running it twice against a real database rather
-- than by reading it.
-- ===========================================================================

BEGIN;

UPDATE business_profile_tasks t
SET payload = jsonb_set(t.payload, '{step}',
      to_jsonb(CASE (t.payload->>'step')::int
        WHEN 0 THEN 3 WHEN 1 THEN 4 WHEN 2 THEN 2 WHEN 3 THEN 5
        WHEN 4 THEN 6 WHEN 5 THEN 7 WHEN 6 THEN 8 WHEN 7 THEN 9 END))
      || '{"v36": true}'::jsonb
WHERE t.kind = 'candidate'
  AND NOT (t.payload ? 'v36')
  -- Only a step this migration has a rule for. A row outside the set is
  -- left alone rather than given a number invented for it, and the IN also
  -- keeps the CASE from writing a NULL step over a good one.
  AND t.payload->>'step' ~ '^\d+$'
  AND (t.payload->>'step')::int IN (0,1,2,3,4,5,6,7);

COMMIT;

-- ── confirm ───────────────────────────────────────────────────────────────
-- Every candidate task by the rung it now sits on. Expect nothing above 9,
-- and nothing on 0 or 1 until somebody works the two new rungs.
SELECT (payload->>'step')::int AS step,
       status,
       count(*)                                  AS tasks,
       count(*) FILTER (WHERE payload ? 'v36')   AS remapped
FROM business_profile_tasks
WHERE kind = 'candidate' AND payload->>'step' ~ '^\d+$'
GROUP BY 1,2 ORDER BY 1,2;
