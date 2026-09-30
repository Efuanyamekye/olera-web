# How to make the weekly board report

**For: Chantel, leading the RTL while Logan is out.**
Written 30 September 2026.

This is the report Logan showed the team on 30 September: how many actions
each person logged, on which day, at which university. It takes about fifteen
minutes, and most of that is Claude writing the summary.

You need three things: the Supabase SQL editor, Claude, and twenty minutes
before the meeting.

---

## The short version

1. Open Supabase, paste in the five queries below, change the two dates at
   the top of each one.
2. Copy the results.
3. Paste them into Claude with the prompt in section 4.
4. Read what comes back against the four sanity checks in section 5.
5. Bring the numbers to the RTL.

---

## 1. Where the numbers come from

Every action anybody takes on the MedJobs board writes one row to a table
called `student_outreach_touchpoints`. An email sent, a call with no answer, a
note added, a stage change: one row each, stamped with who did it and when.
Nothing else on the board is a reliable count of work. In particular:

- **Do not count records.** A record can sit untouched for a month.
- **Do not count logins.** A browser tab left open all week reads as one long
  session, and a person who worked every day can look like they signed in once.
- **Do count touchpoints.** That is the log of things actually done.

There is also a **Logs** page in the admin panel that shows the same history as
a readable feed. Use it to spot-check a person or a day. Use SQL for the counts,
because the page paginates and you will miscount by hand.

---

## 2. Opening the SQL editor

1. Go to **supabase.com**, sign in, open the Olera project.
2. In the left sidebar, click **SQL Editor**.
3. Click **New query**.
4. Paste one query at a time, press **Run** (or Cmd+Enter).
5. Above the results there is a **Download CSV** button. Use it for query 4.

Every query below is read-only. None of them can change or delete anything.

---

## 3. The five queries

**Before running any of them, change the two dates.** They appear at the top of
each query as `report_start` and `report_end`. `report_end` is the day *after*
the last day you want, so a Monday-to-Tuesday report runs 28th to 30th.

Times are in Central. If the team moves, change `America/Chicago`.

### Query 1. Who did what, by day

This is the headline number.

```sql
WITH bounds AS (
  SELECT (DATE '2026-09-28') AT TIME ZONE 'America/Chicago' AS report_start,
         (DATE '2026-09-30') AT TIME ZONE 'America/Chicago' AS report_end
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

`with_a_note` matters. An action logged with a note is a person writing down
what happened. An action logged without one is a button press. Both count, but
the ratio tells you how the week actually went.

### Query 2. Which universities got worked

```sql
WITH bounds AS (
  SELECT (DATE '2026-09-28') AT TIME ZONE 'America/Chicago' AS report_start,
         (DATE '2026-09-30') AT TIME ZONE 'America/Chicago' AS report_end
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

### Query 3. Which kind of record got worked

Providers have far more follow-up rungs than students or job boards do, so a
person on students will always show fewer actions than a person on providers.
This query is what stops the headline number reading as a league table.

```sql
WITH bounds AS (
  SELECT (DATE '2026-09-28') AT TIME ZONE 'America/Chicago' AS report_start,
         (DATE '2026-09-30') AT TIME ZONE 'America/Chicago' AS report_end
)
SELECT
  s.kind                              AS record_type,
  COALESCE(u.email, '(not recorded)') AS person,
  COUNT(*)                            AS actions
FROM student_outreach_touchpoints t
CROSS JOIN bounds b
JOIN student_outreach s    ON s.id = t.outreach_id
LEFT JOIN auth.users u     ON u.id = t.created_by
WHERE t.created_at >= b.report_start
  AND t.created_at <  b.report_end
GROUP BY 1, 2
ORDER BY 3 DESC;
```

### Query 4. The line-by-line log

Download this one as CSV and give it to Claude as a file. It is what lets the
summary say *what* somebody did rather than just how much.

```sql
WITH bounds AS (
  SELECT (DATE '2026-09-28') AT TIME ZONE 'America/Chicago' AS report_start,
         (DATE '2026-09-30') AT TIME ZONE 'America/Chicago' AS report_end
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

### Query 5. Tasks closed, by person

**This query only works for the week of 30 September 2026 onward.** Before that
date the board recorded *when* a task was closed but not *who* closed it, for
five of the seven sections. That was fixed on 30 September. Running this over
an earlier week returns `(not recorded)` for almost everything, which is a gap
in the data and not a person who did nothing.

```sql
WITH bounds AS (
  SELECT (DATE '2026-09-28') AT TIME ZONE 'America/Chicago' AS report_start,
         (DATE '2026-09-30') AT TIME ZONE 'America/Chicago' AS report_end
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

---

## 4. The prompt for Claude

Open Claude, attach the CSV from query 4, and paste the results of queries 1, 2,
3 and 5 as plain text. Then use this prompt. Change the dates and the names.

> I run the weekly operations meeting for Olera MedJobs, a program that places
> student caregivers with home care providers. Our team works a board of
> university campuses: each campus has providers, students, a job board,
> advising offices, student organisations, events and professors, and each
> record moves along a sequence of follow-up steps.
>
> Below are five SQL outputs covering **Monday 28 and Tuesday 29 September
> 2026**. Every row in the attached CSV is one logged action on the board.
>
> The team is Graize, Logan, Chantel and Sara. Graize and Sara are on research
> and outreach; Chantel is on providers, students and job boards.
>
> Write me a one-page summary I can show the team as progress. I need:
>
> 1. Total actions logged, and the split by person and by day.
> 2. The split by university, and by record type.
> 3. Two or three things that actually happened, quoted from the notes column,
>    that show the work was real and not just clicks.
> 4. Anything that looks off: a person at zero, a campus at zero, a day at zero,
>    a lot of actions with no notes.
>
> Rules:
>
> - **This is not a league table.** Providers carry many more follow-up steps
>   than students or job boards, so whoever is on providers will always show
>   more actions. Say so in the summary.
> - A person showing `(not recorded)` is missing data, not missing work. Never
>   report anyone as having done nothing without saying which query would prove
>   it either way.
> - Do not estimate, round up, or fill a gap with a plausible number. If a
>   number is not in what I gave you, say it is not there.
> - Plain language. No jargon, no em dashes.
>
> Then give me the same thing as a single-page HTML file I can print, using
> Olera's colours: teal `#4d8a8a` for headings and accents, cream `#F9F6F2` for
> the page background, dark teal `#1a3030` for body text.

If you want the PDF version, ask for it after: *"turn that HTML into a PDF,
one page, nothing cut off."*

---

## 5. Four sanity checks before you present it

These are the four ways this report has already been wrong once. Check all four.

**1. Is anybody at zero who you know worked?**
Ask them. If they did work, the cause is almost always that their actions are
landing under `(not recorded)`. Add up the `(not recorded)` rows: if that
number is large, the report is measuring the data gap, not the team.

**2. Does the university list have a campus on it you did not expect?**
The 29 September report turned up nineteen actions at the University of Florida,
which nobody thought was being worked. That was real and worth knowing. A
surprise campus is a finding, not an error, but check it before presenting it.

**3. Do the daily totals add up to the overall total?**
If query 1's rows do not sum to the number of rows in the CSV, one of the two
has a different date window. Re-check `report_start` and `report_end`.

**4. Did you say the ratio out loud?**
Actions without notes are not fake, but a week that is 90 percent button
presses and 10 percent notes is a different week from one that is half and
half. Say which one it was.

---

## 6. What to do with it in the meeting

Logan's framing on 30 September, worth keeping:

> This is not meant to be punitive in terms of who did the most tasks.

Lead with the total and the fact that it is a floor, not a ceiling: it counts
only what was logged. Then go person by person, and for each one say what they
were **working on**, not just the count. Then the anomalies, which is where the
useful conversation is.

Finish with blockers. The single highest-value output of this meeting is
somebody saying "I cannot do X" out loud, because a two-minute fix that nobody
reports costs two weeks.

---

## 7. If something does not work

| What you see | What it means | What to do |
|---|---|---|
| `relation "auth.users" does not exist` | The SQL editor is connected as a role that cannot read the auth schema. | Make sure you are in the SQL Editor in the Supabase dashboard, not a connected client. |
| Every row says `(not recorded)` | The week you picked is before 30 September 2026, or `created_by` was never written. | Use query 4 and read the notes column: the work is visible even when the name is not. |
| Zero rows for a day everybody worked | The date window is wrong, or it is in the wrong timezone. | `report_end` is the day *after* the last day you want. |
| A number that looks too high | Bulk emails count one row per recipient. | Check query 4 for a run of identical timestamps. |
| The numbers do not match the Logs page | The Logs page filters out background events such as cancelled and superseded tasks. | The SQL is the more complete count. Both are right. |

Anything else: send the query and the error to Claude and ask what is wrong
with it. That is faster than debugging it by hand, and nothing here can break
anything.
