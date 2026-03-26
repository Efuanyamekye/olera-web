# Plan: Activity Center Delete

Created: 2026-03-26
Status: Not Started

## Goal

Add per-row and bulk delete to the Activity Center admin page across all 4 views (Provider Feed, Provider People, Family Feed, Family People).

## Success Criteria

- [ ] Per-row trash icon on every row in all 4 views
- [ ] Checkbox selection + "Delete selected" bulk action in all 4 views
- [ ] Confirm dialog before any deletion
- [ ] Hard delete from `provider_activity` / `seeker_activity` tables
- [ ] People view delete removes ALL underlying events for that person
- [ ] Total engagement count refreshes after deletion
- [ ] Error feedback shown on failure

## Tasks

### Phase 1: API — DELETE handler

- [ ] 1. Add DELETE method to `app/api/admin/activity/route.ts`
      - Files: `app/api/admin/activity/route.ts`
      - Accepts JSON body:
        ```json
        {
          "actor": "providers" | "families",
          "mode": "events" | "person",
          "ids": ["uuid1", "uuid2"],       // mode=events: specific event IDs
          "person_id": "provider-slug"      // mode=person: delete all events for this person
        }
        ```
      - `mode=events`: DELETE FROM provider_activity/seeker_activity WHERE id IN (ids)
      - `mode=person`: DELETE FROM provider_activity WHERE provider_id = person_id (or seeker_activity WHERE profile_id = person_id)
      - Returns `{ deleted: number }`
      - Verify: curl/fetch the endpoint with test IDs

### Phase 2: UI — Selection state + delete handler

- [ ] 2. Add shared selection state and delete logic to the page component
      - Files: `app/admin/activity/page.tsx`
      - New state: `selectedIds: Set<string>`, `deleting: boolean`, `confirmDialog: { open, message, onConfirm }`
      - `handleDelete(actor, mode, ids/personId)` — calls DELETE API, refetches data, clears selection, refreshes total count
      - Shared `ConfirmDialog` component (inline, not a separate file — quick admin tool)
      - Shared `DeleteBar` component — floating bar when selection is non-empty: "X selected — Delete"
      - Verify: State updates correctly, no console errors

### Phase 3: UI — Wire up all 4 views

- [ ] 3. Add checkboxes + trash icons to ProviderFeedView
      - Files: `app/admin/activity/page.tsx`
      - Checkbox per row (keyed on event.id)
      - Trash icon on hover (right side, before timestamp)
      - Trash click → confirm → delete single event
      - Verify: Can select, bulk delete, and single-delete provider feed events

- [ ] 4. Add checkboxes + trash icons to ProvidersPeopleView
      - Files: `app/admin/activity/page.tsx`
      - Checkbox per row (keyed on provider_id)
      - Trash icon on hover
      - Trash/bulk delete → confirm with warning: "Delete all X events for [provider name]?"
      - Uses `mode=person` API
      - Verify: Can delete all events for a provider from People view

- [ ] 5. Add checkboxes + trash icons to FamilyFeedView
      - Files: `app/admin/activity/page.tsx`
      - Same pattern as task 3 but for family events (keyed on event.id)
      - Verify: Can select and delete family feed events

- [ ] 6. Add checkboxes + trash icons to FamiliesPeopleView
      - Files: `app/admin/activity/page.tsx`
      - Same pattern as task 4 but for families (keyed on profile_id)
      - Uses `mode=person` with profile_id
      - Verify: Can delete all events for a family from People view

### Phase 4: Polish

- [ ] 7. Clear selection on view/actor/filter changes, error banner on failure
      - Files: `app/admin/activity/page.tsx`
      - Reset selectedIds when actor, subView, timeWindow, eventFilter, or search changes
      - Inline error banner (not alert) on delete failure
      - Verify: No stale selections across view switches

## Risks

- **People view bulk delete could be large**: A "Hot" provider with 100+ events would all be deleted. The confirm dialog message should show the event count to prevent accidental mass deletion.
- **Concurrent deletes**: If two admin tabs are open, deleting in one won't reflect in the other until refresh. Acceptable for quick admin tool.
- **5000-event cap in People view**: The aggregated count shown may undercount if a provider has >5000 events. The DELETE still works correctly since it deletes by person_id with no limit.

## Notes

- Only two files modified: the API route and the page component. No new files needed.
- UX pattern: hover-reveal trash icon (consistent with admin image deletion) + checkbox column
- Confirm dialog is inline in the page component — no shared modal system needed for this
