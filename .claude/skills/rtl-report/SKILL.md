---
name: rtl-report
description: >
  Build the weekly MedJobs board report for the RTL meeting: how much work each person
  logged, on which day, at which university, and what actually happened. Use when
  somebody says "/rtl-report", "weekly report", "board report", "team report", "RTL
  report", "progress since Monday", "what did the team do this week", or asks for the
  numbers before the Tuesday operations meeting. The person running this may not write
  SQL and may not have run it before, so the skill hands them one query at a time and
  does the interpreting itself. Takes an optional date range as an argument; ask if it
  is not given.
---

# The weekly board report

You are building the report the team looks at in the Tuesday RTL meeting. The person
running this is most likely Chantel. **Assume they have not done this before.** Hand
them one thing at a time, wait for it, and never make them figure out what to do next.

## Before anything else

**You cannot reach the database.** There are no Supabase credentials in this
environment and there will not be. Every query below is run by the person, by hand, in
the Supabase SQL editor, and they paste the results back to you. Do not try to connect,
do not offer to connect, and do not pretend a number came from anywhere but what they
pasted.

Read `docs/medjobs/operating/10-RTL-REPORT-RUNBOOK.md` if you need background on why
these particular numbers are the right ones. You do not need to make them read it.

## Step 0. Settle the dates, then say what is about to happen

If the dates were not given as an argument, ask for them in one line. The usual answer
is "since Monday", so offer that as the default: Monday of the current week through
today.

Convert whatever they say into two dates:

- `report_start` = the first day you want, at midnight
- `report_end` = **the day after the last day you want**, at midnight

Say the two dates back to them plainly ("so, Monday 6 October through end of Tuesday
7th") and get a yes before going on. A wrong date window is the single most common way
this report comes out wrong, and it is silent when it does.

Then tell them the shape of what is coming, so it does not feel open-ended:

> Five queries. You run each one in Supabase and paste me the result. The fourth one
> you download as a CSV instead of pasting. Then I write the report. About fifteen
> minutes, most of it waiting on me.

If they have never opened the SQL editor: supabase.com, sign in, open the Olera
project, **SQL Editor** in the left sidebar, **New query**, paste, press Run or
Cmd+Enter. All five queries are read-only and none of them can change or delete
anything. Say that last part: people are reasonably nervous about running SQL against
production.

## Step 1 to 5. The queries, one at a time

Hand over **one query per message**. Substitute the real dates into the two lines at
the top before you send it, so there is nothing for them to edit. Wait for the result
before sending the next one.

After each result, say one sentence about what you can see in it. That is what keeps
them from feeling like a data entry clerk, and it is also when you catch a bad date
window, while it is still cheap to fix.

Timezone is `America/Chicago` throughout. If the team moves, change it everywhere.

### Query 1: who did what, by day

```sql
WITH bounds AS (
  SELECT (DATE 'REPORT_START') AT TIME ZONE 'America/Chicago' AS report_start,
         (DATE 'REPORT_END')   AT TIME ZONE 'America/Chicago' AS report_end
)
SELECT
  (t.created_at AT TIME ZONE 'America/Chicago')::date       AS day,
  COALESCE(u.email, '(not recorded)')                       AS person,
  COUNT(*)                                                  AS actions,
  COUNT(*) FILTER (WHERE COALESCE(t.notes, '') <> '')       AS with_a_note
FROM student_outreach_touchpoints t
CROSS JOIN bounds b
LEFT JOIN auth.users u ON u.id = t.created_by
WHERE t.created_at >= b.report_start
  AND t.created_at <  b.report_end
GROUP BY 1, 2
ORDER BY 1, 3 DESC;
```

This is the headline. `with_a_note` is the quality signal: an action logged with a note
is somebody writing down what happened, an action without one is a button press. Both
count. The ratio is the story.

### Query 2: which universities got worked

```sql
WITH bounds AS (
  SELECT (DATE 'REPORT_START') AT TIME ZONE 'America/Chicago' AS report_start,
         (DATE 'REPORT_END')   AT TIME ZONE 'America/Chicago' AS report_end
)
SELECT
  c.name                              AS university,
  COALESCE(u.email, '(not recorded)') AS person,
  COUNT(*)                            AS actions
FROM student_outreach_touchpoints t
CROSS JOIN bounds b
JOIN student_outreach s          ON s.id = t.outreach_id
JOIN student_outreach_campuses c ON c.id = s.campus_id
LEFT JOIN auth.users u           ON u.id = t.created_by
WHERE t.created_at >= b.report_start
  AND t.created_at <  b.report_end
GROUP BY 1, 2
ORDER BY 3 DESC;
```

### Query 3: which kind of record got worked

```sql
WITH bounds AS (
  SELECT (DATE 'REPORT_START') AT TIME ZONE 'America/Chicago' AS report_start,
         (DATE 'REPORT_END')   AT TIME ZONE 'America/Chicago' AS report_end
)
SELECT
  s.kind                              AS record_type,
  COALESCE(u.email, '(not recorded)') AS person,
  COUNT(*)                            AS actions
FROM student_outreach_touchpoints t
CROSS JOIN bounds b
JOIN student_outreach s ON s.id = t.outreach_id
LEFT JOIN auth.users u  ON u.id = t.created_by
WHERE t.created_at >= b.report_start
  AND t.created_at <  b.report_end
GROUP BY 1, 2
ORDER BY 3 DESC;
```

This one exists to stop the headline reading as a league table. Providers carry far
more follow-up steps than students or job boards, so whoever is on providers will
always show more actions. Say so every single time.

### Query 4: the line-by-line log

Tell them to use the **Download CSV** button above the results and attach the file,
rather than pasting it. It is long.

```sql
WITH bounds AS (
  SELECT (DATE 'REPORT_START') AT TIME ZONE 'America/Chicago' AS report_start,
         (DATE 'REPORT_END')   AT TIME ZONE 'America/Chicago' AS report_end
)
SELECT
  to_char(t.created_at AT TIME ZONE 'America/Chicago',
          'YYYY-MM-DD HH24:MI')       AS when_central,
  COALESCE(u.email, '(not recorded)') AS person,
  c.name                              AS university,
  s.organization_name                 AS record,
  s.kind                              AS record_type,
  t.touchpoint_type                   AS what_happened,
  COALESCE(t.outcome, '')             AS outcome,
  COALESCE(t.notes, '')               AS note
FROM student_outreach_touchpoints t
CROSS JOIN bounds b
JOIN student_outreach s          ON s.id = t.outreach_id
JOIN student_outreach_campuses c ON c.id = s.campus_id
LEFT JOIN auth.users u           ON u.id = t.created_by
WHERE t.created_at >= b.report_start
  AND t.created_at <  b.report_end
ORDER BY 1 DESC;
```

This is what lets the report say *what* somebody did rather than only how much. The
`note` column is where the real material is.

### Query 5: tasks closed, by person

**Only meaningful from the week of 30 September 2026 onward.** Before that date five of
the seven board sections recorded when a task was closed but not who closed it. If the
window starts earlier, say so before they run it, and read `(not recorded)` as a gap in
the data rather than a person who did nothing.

```sql
WITH bounds AS (
  SELECT (DATE 'REPORT_START') AT TIME ZONE 'America/Chicago' AS report_start,
         (DATE 'REPORT_END')   AT TIME ZONE 'America/Chicago' AS report_end
)
SELECT
  (tk.completed_at AT TIME ZONE 'America/Chicago')::date AS day,
  COALESCE(u.email, '(not recorded)')                    AS person,
  COUNT(*)                                               AS tasks_closed
FROM student_outreach_tasks tk
CROSS JOIN bounds b
LEFT JOIN auth.users u ON u.id = tk.completed_by
WHERE tk.status = 'completed'
  AND tk.completed_at >= b.report_start
  AND tk.completed_at <  b.report_end
GROUP BY 1, 2
ORDER BY 1, 3 DESC;
```

## Step 6. Run the four checks before you write anything

Do these yourself, out loud, in one short block. Each one is a way this report has
already been wrong once.

1. **Anybody at zero who probably worked?** Add up the `(not recorded)` rows. If that
   number is large, the report is measuring a data gap and not the team. Ask the person
   whether they know that individual was working, and say in the report which query
   would settle it.
2. **A campus on the list nobody expected?** A surprise campus is usually a finding
   worth raising, not an error. Flag it, do not quietly drop it.
3. **Do the daily totals sum to the number of rows in the CSV?** If not, one of the two
   has a different date window. Go back and fix it rather than presenting both.
4. **What is the notes ratio?** A week that is ninety percent button presses is a
   different week from one that is half and half. Name which one it was.

If a check fails, say so and fix it before writing the report. Do not write the report
and mention the problem at the bottom.

## Step 7. Write it

Produce a **one-page HTML file** and render it as a PDF, using the toolchain that
already exists in the repo:

- Olera colours: teal `#4d8a8a` for headings and accents, dark teal `#1a3030` for body
  text, cream `#F9F6F2` for panels.
- Render with `docs/medjobs/matrix-src/html2pdf.mjs`, which drives the local Chromium
  with the network switched off. Any font must be embedded as a data URI or it will not
  appear.
- Send the person both the PDF and a short summary in the chat, because they will want
  to paste a few lines into Slack without opening anything.

What goes on the page:

1. Total actions, and the split by person and by day.
2. The split by university and by record type.
3. Two or three things that actually happened, quoted from the `note` column. This is
   the part people remember. Pick the ones that show the work was real.
4. Anything that looks off, from the four checks.

## The rules that matter more than the format

- **It is not a league table.** Say it on the page, not just to yourself. Logan's
  framing, worth reusing: *"This is not meant to be punitive in terms of who did the
  most tasks."* Providers have more steps than students. A person on students doing
  excellent work will show a smaller number, and the report has to say that where
  everyone can see it.
- **`(not recorded)` is missing data, not missing work.** Never report anybody as
  having done nothing without saying which query would prove it either way.
- **Never estimate, round up, or fill a gap with a plausible number.** If a number is
  not in what they pasted, say it is not there. The first version of this report came
  back with 203 of 203 tasks unattributed and was very nearly presented as a team that
  had done nothing.
- **Count touchpoints, not records and not logins.** A record can sit untouched for a
  month. A browser tab left open all week reads as a single sign-in, so a person who
  worked every day can look like they came in once.

## If something goes wrong

| What they see | What it means | What to tell them |
|---|---|---|
| `relation "auth.users" does not exist` | Connected as a role that cannot read the auth schema. | Use the SQL Editor inside the Supabase dashboard, not a connected client. |
| Every row is `(not recorded)` | The window is before 30 September 2026, or `created_by` was never written. | Fall back to query 4 and read the notes: the work is visible even when the name is not. |
| Zero rows for a day everybody worked | Wrong window, or wrong timezone. | `report_end` is the day *after* the last day wanted. |
| A number that looks too high | Bulk emails write one row per recipient. | Check query 4 for a run of identical timestamps. |
| Numbers do not match the admin Logs page | That page filters out background events such as cancelled and superseded tasks. | The SQL is the fuller count. Both are right. |

Anything else: ask them to paste the error, read it, and fix the query for them. Do not
send them away to debug it. Nothing here can break anything, so trying again is free.

## Answer their questions

They will ask things like "why is Sara so low" or "what counts as an action" or "can we
see this by week instead". Answer from the data in front of you, write a new query if
one is needed, and hand it over the same way as the others. The point of this being a
skill rather than a document is that the questions get answered.
