-- Migration: Mobile nav click tracking events
--
-- Adds event types to track clicks on key navigation actions:
--   - nav_families_clicked: Provider clicked "Find Families" / "Families"
--   - nav_hire_clicked: Provider clicked "Hire Caregivers" / "Hire"
--
-- These events include metadata:
--   - variant: "current" | "bottom_tabs" (which A/B arm)
--   - source: "bottom_tabs" | "hamburger_menu" (where the click originated)
--
-- Apply via Supabase dashboard (NOT CLI).

ALTER TABLE provider_activity DROP CONSTRAINT IF EXISTS provider_activity_event_type_check;

ALTER TABLE provider_activity ADD CONSTRAINT provider_activity_event_type_check CHECK (
  event_type IN (
    'lead_received',
    'email_click',
    'page_view',
    'lead_opened',
    'question_received',
    'question_responded',
    'review_viewed',
    'one_click_access',
    'contact_revealed',
    'phone_clicked',
    'email_link_clicked',
    'continue_in_inbox',
    'reviews_cta_clicked',
    'suspicious_claim',
    'analytics_teaser_impression',
    'analytics_teaser_cta_clicked',
    'provider_profile_edited',
    'provider_picker_impression',
    'provider_picker_clicked',
    'dashboard_arrival',
    'provider_saved',
    'review_received',
    'claim_completed',
    'matches_page_viewed',
    'matches_card_clicked',
    'matches_message_generated',
    'matches_outreach_sent',
    'market_diagnostic_viewed_no_leads',
    'market_outreach_status_updated',
    'managed_ads_pitch_viewed',
    'managed_ads_cta_clicked',
    'managed_ads_boost_viewed',
    'managed_ads_requested',
    'your_market_viewed',
    'your_market_playbook_clicked',
    'ads_touchpoint_viewed',
    'ads_touchpoint_clicked',
    'ads_touchpoint_dismissed',
    'mobile_nav_variant_impression',
    -- New: Mobile nav click tracking
    'nav_families_clicked',
    'nav_hire_clicked',
    'benefits_entry_viewed',
    'benefits_step_viewed',
    'benefits_step_completed',
    'search_click',
    'cta_click_public',
    'benefits_started',
    'multi_provider_viewed',
    'multi_provider_card_shown',
    'multi_provider_engaged',
    'multi_provider_asked',
    'multi_provider_skipped',
    'multi_provider_converted',
    'multi_provider_flow_completed',
    'multi_provider_save_all',
    'cta_variant_impression',
    'cta_variant_clicked',
    'enrichment_started',
    'enrichment_step_completed',
    'enrichment_step_skipped',
    'enrichment_completed',
    'enrichment_profile_published',
    'enrichment_go_live_skipped',
    'benefits_enrichment_started',
    'benefits_enrichment_step_completed',
    'benefits_enrichment_step_skipped',
    'benefits_enrichment_completed',
    'review_no_email_signal'
  )
);

COMMENT ON CONSTRAINT provider_activity_event_type_check ON provider_activity IS
'Allowed event types including nav_families_clicked and nav_hire_clicked for mobile nav A/B test. Last update: migration 119 (mobile_nav_click_events).';
