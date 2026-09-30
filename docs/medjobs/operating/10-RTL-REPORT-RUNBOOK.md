# The RTL report

The one-page report posted before every RTL: the board work done since the last
one, by person, day, university and record type, with what actually happened.

## When

RTLs are **Monday, Wednesday and Friday at 8:30am Eastern.** The manager logs on at
**8:00**, runs the report, reads it, and posts the PDF and the short summary before
the meeting.

Each report covers **8:00am Eastern on the previous RTL day to 8:00am today**
(Monday's covers Friday and the weekend), so consecutive reports meet exactly.

## How

In Claude Code, type `/rtl-report`. It gives you one query, already filled in.
You run it in the Supabase SQL editor, download the result as a CSV, and attach it.
Claude checks it, writes the page, and gives you the PDF and a Slack-ready summary.
About fifteen minutes.

The skill lives in `.claude/skills/rtl-report/`: `SKILL.md` holds the query and the
steps, and `build.py` computes every number from the CSV and renders the page, so no
figure is typed by hand.

## Why these numbers

- **Count closed board steps.** When somebody completes a step on the board, it lands
  in one of three task tables: `student_outreach_tasks`, `site_tasks` or
  `business_profile_tasks`. The query reads all three.
- **Not `student_outreach_touchpoints`.** The first version of this report counted
  that table. The board stopped writing to it on 21 September 2026, so it came back
  empty for a week in which 167 steps were closed.
- **Not records, not logins.** A record can sit untouched for a month, and a browser
  tab left open all week reads as a single sign-in.
- **Names from 30 September 2026.** Before midday that day the board did not record
  who closed a step. An unnamed step is missing data, not missing work.
- **Notes are the quality signal.** A step closed with a note is somebody writing
  down what happened. The ratio says what kind of window it was.

## It is not a league table

*"This is not meant to be punitive in terms of who did the most tasks."* Provider
records carry more steps than students, so whoever is on providers always shows a
bigger number. The page says so every time.
