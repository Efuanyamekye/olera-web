-- Cortex's daily inbox report gains two kinds of item (TJ, 2026-10-02):
--   slack_draft: a reply he owes on Slack, drafted; approving posts it in the
--                thread as him (cortex_slack_user_tokens, migration 269).
--   proposal:    the organic read's one action for the day; approving turns it
--                into a cortex_handoffs brief for a Claude Code session.
--
-- Widens the kind CHECK only. Additive: every existing row stays valid.

ALTER TABLE cortex_inbox_items DROP CONSTRAINT IF EXISTS cortex_inbox_items_kind_check;
ALTER TABLE cortex_inbox_items ADD CONSTRAINT cortex_inbox_items_kind_check
  CHECK (kind IN ('triage_batch', 'sms_draft', 'email_draft', 'question', 'slack_draft', 'proposal'));
