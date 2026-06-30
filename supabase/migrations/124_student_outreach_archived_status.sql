-- Add an "archived" status to student_outreach.
--
-- Archive is a whole-prospect lifecycle action, distinct from "Stop outreach":
-- it halts the running cadence and parks the prospect, but unlike the terminal
-- not_interested / do_not_contact statuses it is explicitly meant to be
-- reopened later. Archived prospects still surface on the Site's campus page
-- (as an "Archived" status tag, no separate section/filter).
--
-- Reopen transitions any closed/archived row back to "researched"; see
-- app/api/admin/student-outreach/[id]/route.ts handleReopen.

ALTER TABLE student_outreach
  DROP CONSTRAINT IF EXISTS student_outreach_status_check;

ALTER TABLE student_outreach
  ADD CONSTRAINT student_outreach_status_check CHECK (status IN (
    'prospect',
    'researched',
    'outreach_sent',
    'engaged',
    'meeting_scheduled',
    'agreed',
    'distributed',
    'active_partner',
    'not_interested',
    'no_response_closed',
    'do_not_contact',
    'wrong_contact',
    'redirected',
    'archived'
  ));
