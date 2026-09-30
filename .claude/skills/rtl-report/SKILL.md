---
name: rtl-report
description: >
  Build the MedJobs RTL report: the board work done since the last RTL, by person,
  day, university and record type, with what actually happened. RTLs are Monday,
  Wednesday and Friday at 8:30am Eastern; the manager runs this at 8:00 and posts it
  before the meeting. Use when somebody says "/rtl-report", "RTL report", "board
  report", "team report", "weekly report", "what did the team do", or asks for the
  numbers before an RTL. The person running it may not write SQL: they run one
  query, download a CSV, and Claude does the rest. Takes an optional window as an
  argument; the default is since the last RTL.
---

# The RTL report

The manager logs on at **8:00am Eastern** on Monday, Wednesday or Friday, runs this,
reads the PDF, and posts it before the **8:30 RTL**. Thirty minutes, so keep every
message short and hand them one thing at a time. Assume they have not done it before.

**You cannot reach the database.** They run the query by hand in the Supabase SQL
editor and give you the CSV. Never present a number that did not come from that file.

## Step 1. The window: since the last RTL

Each report covers **8:00am Eastern on the previous RTL day to 8:00am Eastern
today**, so consecutive reports meet exactly, with no gap and no overlap:

| Run on | Covers |
|---|---|
| Monday | Friday 8:00am → Monday 8:00am (includes the weekend) |
| Wednesday | Monday 8:00am → Wednesday 8:00am |
| Friday | Wednesday 8:00am → Friday 8:00am |

Work out today's window from the date and say it back in one line with real dates:
"This covers Monday 5 October, 8:00am to Wednesday 7 October, 8:00am Eastern. OK?"
Get a yes. If a meeting was skipped (a holiday, a cancelled RTL), start at the last
RTL that actually happened. If it is not an RTL day, ask which window they want.

## Step 2. One query, one CSV

Replace `START` and `END` with the two dates (`2026-10-05`), then send it with these instructions in the same message:

> supabase.com → Olera project → **SQL Editor** → **New query**. Paste this, press
> **Run**. It only reads; it cannot change or delete anything. When it finishes,
> click **Export** (top right of the results) → **Download CSV**, and attach the
> file here.

```sql
WITH bounds AS (
  SELECT (TIMESTAMP 'START 08:00') AT TIME ZONE 'America/New_York' AS report_start,
         (TIMESTAMP 'END 08:00')   AT TIME ZONE 'America/New_York' AS report_end
),
closed AS (
  SELECT 'record steps' AS board_area, tk.completed_at, tk.completed_by,
         c.name AS university, s.organization_name AS record, s.kind AS record_type,
         tk.task_type, tk.notes
    FROM student_outreach_tasks tk
    LEFT JOIN student_outreach s          ON s.id = tk.outreach_id
    LEFT JOIN student_outreach_campuses c ON c.id = s.campus_id
   WHERE tk.status = 'completed'
  UNION ALL
  SELECT 'site steps', st.completed_at, st.completed_by,
         c.name, c.name, 'site', st.task_type, st.notes
    FROM site_tasks st
    LEFT JOIN student_outreach_campuses c ON c.id = st.campus_id
   WHERE st.status = 'completed'
  UNION ALL
  SELECT 'client/candidate steps', bt.completed_at, bt.completed_by,
         NULL, bp.display_name, 'client/candidate', bt.task_type, bt.notes
    FROM business_profile_tasks bt
    LEFT JOIN business_profiles bp ON bp.id = bt.business_profile_id
   WHERE bt.status = 'completed'
)
SELECT
  to_char(cl.completed_at AT TIME ZONE 'America/New_York', 'YYYY-MM-DD HH24:MI') AS when_eastern,
  COALESCE(u.email, '(not recorded)') AS person,
  cl.board_area,
  COALESCE(cl.university, '')         AS university,
  COALESCE(cl.record, '')             AS record,
  cl.record_type,
  cl.task_type                        AS what_happened,
  COALESCE(cl.notes, '')              AS note
FROM closed cl
CROSS JOIN bounds b
LEFT JOIN auth.users u ON u.id = cl.completed_by
WHERE cl.completed_at >= b.report_start
  AND cl.completed_at <  b.report_end
ORDER BY 1 DESC;
```

This is the only query. The board writes its work to these three task tables.
`student_outreach_touchpoints` is **not** a count of board work (the board stopped
writing to it on 21 September 2026) — do not go back to it.

If the result is **zero rows**, the window is wrong: check the dates before anything
else. If it is an error, ask for the error text and fix the query yourself.

## Step 3. Checks, before writing a word

```bash
python3 .claude/skills/rtl-report/build.py checks <the csv>
```

It computes every number. Read the output against these, and say the result in one
short block:

1. **`not_recorded`.** Unnamed steps are missing data, not missing work. Names are
   recorded from midday 30 September 2026; any unnamed step after that is a part of
   the board that still is not saving the name — flag it with its time.
2. **Campuses.** Anything surprising in `by_university` is a finding, not an error.
   Scan the notes for records filed under the wrong campus ("based in NY", "far from")
   and for `duplicate_notes`.
3. **Notes ratio** (`with_note` / `rows`, and per record type). Say whether the
   window was mostly written-up work or mostly button presses.
4. **`batches`.** A run of quick, note-less steps on one campus is a batch send.
   Legitimate, but a different kind of work from a call. `cleanup_notes` counts
   closures like "Already done" — board cleanup, not new outreach.

If something makes the numbers wrong (not merely surprising), fix it before writing.

## Step 4. Write it

Read the `note` column and write `editorial.json` in the scratchpad (format at the
top of `build.py`): the window line, an optional headline KPI taken from the notes
(for example providers saying they are interested), **two or three quotes** that show
the work was real, one optional aside, and **up to five** flags from Step 3. Leave
out anybody's phone number or email address when quoting.

```bash
python3 .claude/skills/rtl-report/build.py render <the csv> <editorial.json> <scratchpad dir>
```

It lays out the page, renders the PDF with the repo's offline Chromium, and warns if
it runs past one page (shorten the quotes or flags and render again). Look at the
page, then send the PDF with `SendUserFile`.

## Step 5. Hand it over

Send in chat, right under the PDF, a Slack-ready post of four or five lines: total
steps and notes, the university and record-type split, the one or two things that
actually happened, and the unnamed-steps caveat if there is one. The manager pastes
it with the PDF before 8:30.

## Rules

- **Not a league table.** The page says so, in Logan's words: *"This is not meant to
  be punitive in terms of who did the most tasks."* Provider records carry more steps
  than students, so a person on students doing excellent work shows a smaller number.
- **`(not recorded)` is missing data, not missing work.** Never say anybody did
  nothing.
- **Never estimate or fill a gap.** Every number comes from `build.py`.
- **Count closed steps**, not records and not logins.

Answer follow-up questions ("why is X low", "can we see a different window") from the
CSV, or with a new query handed over the same way.
