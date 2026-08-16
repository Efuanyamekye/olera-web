import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getAdminUser, getServiceClient } from "@/lib/admin";
import {
  type ProviderOutreachTemplateKey,
  generateTaskSchedule,
  renderEmail,
  buildContextFromProvider,
  validateProviderForOutreach,
  getProviderGaps,
  formatGapList,
  getCityViewsBatch,
  PROVIDER_OUTREACH_CADENCE,
  PROVIDER_OUTREACH_FROM,
} from "@/lib/provider-outreach";
import {
  type ProviderBridgeRow,
  type ProviderSmartleadData,
  launchProviderCampaign,
  enrollProviderIntoCampaign,
  generateCampaignName,
  buildProviderSmartleadPreview,
  resolveProviderMailboxPool,
} from "@/lib/provider-outreach/smartlead-bridge";
import {
  isVariantTestingActive,
  selectVariantsForProviders,
  type VariantAssignment,
} from "@/lib/provider-outreach/variant-testing";
import { isSmartleadConfigured } from "@/lib/smartlead";

/**
 * POST /api/admin/provider-outreach/launch-sequence
 *
 * Preview or launch an email sequence for provider(s).
 *
 * Body:
 *   - provider_ids: string[] (required) - List of provider IDs to include
 *   - dry_run: boolean (default: true) - If true, returns preview only; if false, launches sequence
 *
 * Returns (dry_run=true):
 *   - providers: Array of provider previews with rendered emails
 *   - schedule: The cadence schedule (days and template keys)
 *   - summary: Counts of valid/invalid providers
 *
 * Returns (dry_run=false):
 *   - success: boolean
 *   - launched: count of providers whose sequence was started
 *   - failed: count of providers that failed to launch
 *   - launched_providers: array of provider IDs
 *   - failed_providers: array of { provider_id, error }
 *   - schedule: the cadence schedule with due dates
 *
 * When dry_run=false:
 *   1. Moves valid providers to "in_sequence" stage
 *   2. Creates tasks in provider_outreach_tasks table (4 tasks per provider)
 *   3. Logs a sequence_launched touchpoint
 *   4. Cron job picks up due tasks and sends emails
 */

interface ProviderPreview {
  provider_id: string;
  provider_name: string;
  email: string | null;
  city: string | null;
  state: string | null;
  category: string | null;
  valid: boolean;
  errors: string[];
  emails: Array<{
    day: number;
    templateKey: ProviderOutreachTemplateKey;
    subject: string;
    bodyPreview: string; // First 200 chars of plain text body
    html: string; // Full rendered HTML for preview
  }>;
  // SmartLead preview (when configured)
  smartlead_preview?: ReturnType<typeof buildProviderSmartleadPreview>;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();
    const { provider_ids, dry_run = true, assigned_to, use_apollo_email } = body;

    // Resolve assigned_to: default to current admin if not specified
    const assignedToId = assigned_to || adminUser.id;

    if (!provider_ids || !Array.isArray(provider_ids) || provider_ids.length === 0) {
      return NextResponse.json(
        { error: "provider_ids array is required" },
        { status: 400 }
      );
    }

    if (provider_ids.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 providers per batch" },
        { status: 400 }
      );
    }

    // Ensure all provider_ids are strings
    const validProviderIds = provider_ids.filter((id): id is string => typeof id === "string" && id.length > 0);
    if (validProviderIds.length === 0) {
      return NextResponse.json(
        { error: "No valid provider IDs provided" },
        { status: 400 }
      );
    }

    console.log("[launch-sequence] Fetching providers:", validProviderIds);

    const db = getServiceClient();

    // Fetch provider data including fields needed for gap detection
    // Note: provider_ids are the provider_id column values, not slugs
    const { data: providers, error: fetchError } = await db
      .from("olera-providers")
      .select("provider_id, slug, provider_name, email, city, state, provider_category, lower_price, upper_price, contact_for_price, provider_images, phone, provider_description")
      .in("provider_id", validProviderIds);

    if (fetchError) {
      console.error("Failed to fetch providers:", fetchError);
      return NextResponse.json(
        { error: `Failed to fetch provider data: ${fetchError.message}` },
        { status: 500 }
      );
    }

    // Check for already-claimed providers (business_profiles with account_id set)
    // These providers have claimed their listing and shouldn't receive outreach
    const { data: claimedBps } = await db
      .from("business_profiles")
      .select("source_provider_id")
      .in("source_provider_id", validProviderIds)
      .not("account_id", "is", null);

    const claimedProviderIds = new Set(
      (claimedBps || []).map((bp) => bp.source_provider_id).filter(Boolean)
    );

    // Batch-fetch city views for Day 5 demand-loss email
    // This is more efficient than fetching per-provider
    const cityViewsPairs = (providers || [])
      .filter((p) => p.city)
      .map((p) => ({ city: p.city, category: p.provider_category }));
    const cityViewsMap = await getCityViewsBatch(cityViewsPairs, db);

    // Batch-fetch tracking records with apollo_contact for decision-maker greetings
    // This allows previews to show personalized "Hi John," vs "Hi Sunrise Senior Living,"
    const { data: trackingData } = await db
      .from("provider_outreach_tracking")
      .select("provider_id, apollo_contact")
      .in("provider_id", validProviderIds);

    const apolloContactMap = new Map<string, { first_name?: string; email?: string }>();
    for (const row of trackingData ?? []) {
      if (row.apollo_contact) {
        apolloContactMap.set(row.provider_id, row.apollo_contact as { first_name?: string; email?: string });
      }
    }

    // Check if SmartLead is configured (affects preview rendering)
    const useSmartLead = isSmartleadConfigured();

    // Build previews for each provider
    const previews: ProviderPreview[] = [];
    let validCount = 0;
    let invalidCount = 0;

    for (const providerId of validProviderIds) {
      const provider = providers?.find((p) => p.provider_id === providerId);

      if (!provider) {
        previews.push({
          provider_id: providerId,
          provider_name: providerId,
          email: null,
          city: null,
          state: null,
          category: null,
          valid: false,
          errors: ["Provider not found"],
          emails: [],
        });
        invalidCount++;
        continue;
      }

      // Check if provider is already claimed
      if (claimedProviderIds.has(providerId)) {
        previews.push({
          provider_id: providerId,
          provider_name: provider.provider_name || providerId,
          email: provider.email,
          city: provider.city,
          state: provider.state,
          category: provider.provider_category,
          valid: false,
          errors: ["Provider has already claimed their listing"],
          emails: [],
        });
        invalidCount++;
        continue;
      }

      // Validate provider has required data
      const validation = validateProviderForOutreach({
        provider_id: providerId,
        name: provider.provider_name,
        email: provider.email,
        city: provider.city,
        state: provider.state,
        slug: provider.slug,
      });

      if (!validation.valid) {
        previews.push({
          provider_id: providerId,
          provider_name: provider.provider_name || providerId,
          email: provider.email,
          city: provider.city,
          state: provider.state,
          category: provider.provider_category,
          valid: false,
          errors: validation.errors,
          emails: [],
        });
        invalidCount++;
        continue;
      }

      // Compute profile gaps for Day 3 email
      // Note: hero_image_url column doesn't exist in olera-providers yet
      const gaps = getProviderGaps({
        lower_price: provider.lower_price,
        upper_price: provider.upper_price,
        contact_for_price: provider.contact_for_price,
        provider_images: provider.provider_images,
        phone: provider.phone,
        provider_description: provider.provider_description,
      });
      const gapList = formatGapList(gaps);

      // Get city views for this provider's city+category
      const cityViewsKey = `${provider.city}|${provider.provider_category || ""}`;
      const cityViews = cityViewsMap.get(cityViewsKey) || 0;

      // Get Apollo contact for personalized greeting
      const apolloContact = apolloContactMap.get(providerId);
      const decisionMaker = apolloContact?.first_name ? {
        first_name: apolloContact.first_name,
        last_name: null,
        title: null,
      } : undefined;

      // Build context and render emails
      const context = buildContextFromProvider({
        provider_id: providerId,
        name: provider.provider_name,
        email: provider.email,
        city: provider.city,
        state: provider.state,
        category: provider.provider_category,
        slug: provider.slug,
      }, {
        gap_list: gapList,
        city_views: cityViews,
        decision_maker: decisionMaker,
      });

      const emails: ProviderPreview["emails"] = [];

      for (const step of PROVIDER_OUTREACH_CADENCE) {
        // When SmartLead is configured, Day 5 (demand_loss) must use generic headline
        // because SmartLead can't conditionally change email body per-lead.
        // Force city_views below threshold (10) to show "Families are searching..."
        // instead of specific view counts that might not match SmartLead behavior.
        let stepContext = context;
        if (useSmartLead && step.templateKey === "demand_loss") {
          stepContext = { ...context, city_views: 5 };
        }
        const rendered = renderEmail(step.templateKey, stepContext);
        emails.push({
          day: step.day,
          templateKey: step.templateKey,
          subject: rendered.subject,
          bodyPreview: rendered.text.substring(0, 200) + "...",
          html: rendered.html,
        });
      }

      // Build SmartLead-specific preview when SmartLead is configured
      // This shows exactly what SmartLead will send (different HTML than Resend)
      let smartleadPreview: ReturnType<typeof buildProviderSmartleadPreview> | undefined;
      if (useSmartLead) {
        smartleadPreview = buildProviderSmartleadPreview({
          provider: {
            tracking_id: "", // Not needed for preview
            provider_id: providerId,
            provider_name: provider.provider_name,
            email: provider.email,
            city: provider.city,
            state: provider.state,
            category: provider.provider_category,
            slug: provider.slug,
            claim_url: context.claim_url,
            profile_url: context.profile_url,
            manage_url: context.manage_url,
            remove_url: context.remove_url,
            unsubscribe_url: context.unsubscribe_url,
            gap_list: gapList,
            city_views: cityViews,
            decision_maker_first_name: apolloContact?.first_name,
          },
          campaignName: `Preview - ${provider.state || "OTHER"}`,
        });
      }

      previews.push({
        provider_id: providerId,
        provider_name: provider.provider_name,
        email: provider.email,
        city: provider.city,
        state: provider.state,
        category: provider.provider_category,
        valid: true,
        errors: [],
        emails,
        smartlead_preview: smartleadPreview,
      });
      validCount++;
    }

    // Generate schedule info
    const now = new Date();
    const schedule = generateTaskSchedule(now);

    // If not dry run, launch the sequence for valid providers
    if (!dry_run) {
      const validPreviews = previews.filter((p) => p.valid);

      if (validPreviews.length === 0) {
        return NextResponse.json({
          error: "No valid providers to launch sequence for",
          invalid_count: invalidCount,
        }, { status: 400 });
      }

      // Fetch city owners for inheritance lookup
      // Group providers by state to batch fetch city owners
      const statesInBatch = [...new Set(validPreviews.map((p) => p.state).filter(Boolean))] as string[];
      const cityOwnersMap = new Map<string, { owner_id: string; owner_name: string | null }>();

      if (statesInBatch.length > 0) {
        const { data: cityOwners } = await db
          .from("provider_outreach_city_owners")
          .select("state, city, owner_id, owner_name")
          .in("state", statesInBatch)
          .not("owner_id", "is", null);

        if (cityOwners) {
          for (const co of cityOwners) {
            cityOwnersMap.set(`${co.state}|${co.city}`, {
              owner_id: co.owner_id,
              owner_name: co.owner_name,
            });
          }
        }
      }

      // SAFEGUARD: If SmartLead is configured, verify prerequisites before proceeding
      // (useSmartLead is already defined at the top of this function)
      if (useSmartLead) {
        // Check 1: Verify mailboxes are available
        const mailboxCheck = await resolveProviderMailboxPool();
        if (!mailboxCheck.ok) {
          return NextResponse.json({
            error: "SmartLead prerequisite check failed",
            details: {
              issue: "mailbox_pool",
              message: mailboxCheck.error,
              fix: "Ensure PROVIDER_OUTREACH_SMARTLEAD_SENDERS env var is set and those email accounts are connected in SmartLead",
            },
            fallback_available: true,
            fallback_hint: "Set SMARTLEAD_API_KEY to empty to use Resend instead",
          }, { status: 400 });
        }

        // Check 2: Verify smartlead_data column exists (migration ran)
        const { error: schemaError } = await db
          .from("provider_outreach_tracking")
          .select("smartlead_data")
          .limit(1);

        if (schemaError?.message?.includes("smartlead_data")) {
          return NextResponse.json({
            error: "SmartLead prerequisite check failed",
            details: {
              issue: "database_migration",
              message: "Column 'smartlead_data' does not exist",
              fix: "Run migration 069_provider_outreach_smartlead.sql",
            },
            fallback_available: true,
            fallback_hint: "Set SMARTLEAD_API_KEY to empty to use Resend instead",
          }, { status: 400 });
        }

        // Log warnings but don't block
        if (mailboxCheck.pool.warnings.length > 0) {
          console.warn("[launch-sequence] SmartLead warnings:", mailboxCheck.pool.warnings);
        }
      }

      // Check if variant testing is active and get variant assignments
      const variantTestingActive = await isVariantTestingActive();
      let variantAssignments = new Map<string, VariantAssignment>();

      if (variantTestingActive) {
        const providerIdsForVariants = validPreviews.map((p) => p.provider_id);
        variantAssignments = await selectVariantsForProviders(providerIdsForVariants);
        console.log(`[launch-sequence] Variant testing active, assigned ${variantAssignments.size} providers to variants`);
      }

      // 1. Get or create tracking records and move to in_sequence
      const launchedProviders: string[] = [];
      const failedProviders: Array<{ provider_id: string; error: string }> = [];
      const trackingRecords: Map<string, {
        trackingId: string;
        preview: typeof validPreviews[0];
        variantAssignment?: VariantAssignment;
        apolloEmail?: string | null;
        apolloFirstName?: string | null;
      }> = new Map();

      for (const preview of validPreviews) {
        try {
          // Determine assigned_to with city owner inheritance:
          // 1. If assigned_to was explicitly provided in request, use that
          // 2. If provider's city has an owner, inherit the city owner
          // 3. Otherwise, use the current admin as default
          let effectiveAssignedTo = assignedToId;
          if (!assigned_to && preview.state && preview.city) {
            const cityOwnerKey = `${preview.state}|${preview.city}`;
            const cityOwner = cityOwnersMap.get(cityOwnerKey);
            if (cityOwner) {
              effectiveAssignedTo = cityOwner.owner_id;
            }
          }

          // Check if tracking record exists
          const { data: existingTracking } = await db
            .from("provider_outreach_tracking")
            .select("id, stage, assigned_to, smartlead_data, apollo_contact")
            .eq("provider_id", preview.provider_id)
            .maybeSingle();

          let trackingId: string;

          if (existingTracking) {
            // Already in sequence? Skip
            if (existingTracking.stage === "in_sequence") {
              failedProviders.push({
                provider_id: preview.provider_id,
                error: "Already in sequence",
              });
              continue;
            }

            // Clean up any stale pending tasks from previous cycle
            // This prevents old Day 7 tasks from firing alongside new Day 0 tasks
            await db
              .from("provider_outreach_tasks")
              .delete()
              .eq("tracking_id", existingTracking.id)
              .eq("status", "pending");

            // For existing records: only update assigned_to if it's currently null
            // This preserves manual assignments while still inheriting city owner for unassigned
            const newAssignedTo = existingTracking.assigned_to || effectiveAssignedTo;

            // Get variant assignment for this provider
            const variantAssignment = variantAssignments.get(preview.provider_id);

            // Update to in_sequence with fresh sequence_started_at
            // Clear smartlead_data for fresh enrollment
            const updateFields: Record<string, unknown> = {
              stage: "in_sequence",
              sequence_started_at: new Date().toISOString(),
              assigned_to: newAssignedTo,
              smartlead_data: null, // Clear for fresh SmartLead enrollment
            };

            // Add variant fields if testing is active, clear if not
            if (variantAssignment) {
              updateFields.variant_id = variantAssignment.variant_id;
              updateFields.variant_key = variantAssignment.variant_key;
              updateFields.variant_enrolled_at = new Date().toISOString();
            } else {
              // Clear any previous variant assignment when testing is inactive
              updateFields.variant_id = null;
              updateFields.variant_key = null;
              updateFields.variant_enrolled_at = null;
            }

            const { error: updateError } = await db
              .from("provider_outreach_tracking")
              .update(updateFields)
              .eq("id", existingTracking.id);

            if (updateError) throw updateError;
            trackingId = existingTracking.id;
          } else {
            // Get variant assignment for this provider
            const variantAssignment = variantAssignments.get(preview.provider_id);

            // Create new tracking record in in_sequence stage
            const insertFields: Record<string, unknown> = {
              provider_id: preview.provider_id,
              stage: "in_sequence",
              city: preview.city,
              state: preview.state,
              sequence_started_at: new Date().toISOString(),
              assigned_to: effectiveAssignedTo,
            };

            // Add variant fields if testing is active
            if (variantAssignment) {
              insertFields.variant_id = variantAssignment.variant_id;
              insertFields.variant_key = variantAssignment.variant_key;
              insertFields.variant_enrolled_at = new Date().toISOString();
            }

            const { data: newTracking, error: insertError } = await db
              .from("provider_outreach_tracking")
              .insert(insertFields)
              .select("id")
              .single();

            if (insertError) throw insertError;
            trackingId = newTracking.id;
          }

          // Store variant assignment with tracking record for later use
          const variantAssignment = variantAssignments.get(preview.provider_id);
          // Get Apollo contact data if available from existing tracking
          const apolloContact = existingTracking?.apollo_contact as { email?: string; first_name?: string } | null;
          const apolloEmail = apolloContact?.email ?? null;
          const apolloFirstName = apolloContact?.first_name ?? null;
          trackingRecords.set(preview.provider_id, { trackingId, preview, variantAssignment, apolloEmail, apolloFirstName });
        } catch (err) {
          console.error(`Failed to create tracking for ${preview.provider_id}:`, err);
          failedProviders.push({
            provider_id: preview.provider_id,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      // If SmartLead is configured, enroll via SmartLead
      // Otherwise, fall back to legacy task-based system
      if (useSmartLead && trackingRecords.size > 0) {
        // Group providers by state for per-state campaigns
        const providersByState = new Map<string, ProviderBridgeRow[]>();

        for (const [providerId, { trackingId, preview, apolloEmail, apolloFirstName }] of trackingRecords) {
          const state = preview.state || "OTHER";

          // Get the provider data needed for SmartLead
          const provider = providers?.find((p) => p.provider_id === providerId);
          if (!provider) continue;

          // Use Apollo email if requested and available, otherwise use provider's generic email
          const effectiveEmail = (use_apollo_email && apolloEmail) ? apolloEmail : provider.email;

          // Build decision_maker for personalized greeting
          const decisionMaker = apolloFirstName ? {
            first_name: apolloFirstName,
            last_name: null,
            title: null,
          } : undefined;

          // Build context for URL generation
          const context = buildContextFromProvider({
            provider_id: providerId,
            name: provider.provider_name,
            email: effectiveEmail,
            city: provider.city,
            state: provider.state,
            category: provider.provider_category,
            slug: provider.slug,
          }, {
            decision_maker: decisionMaker,
          });

          // Get gap list for this provider
          const gaps = getProviderGaps({
            lower_price: provider.lower_price,
            upper_price: provider.upper_price,
            contact_for_price: provider.contact_for_price,
            provider_images: provider.provider_images,
            phone: provider.phone,
            provider_description: provider.provider_description,
          });
          const gapList = formatGapList(gaps);

          // Get city views
          const cityViewsKey = `${provider.city}|${provider.provider_category || ""}`;
          const cityViews = cityViewsMap.get(cityViewsKey) || 0;

          const bridgeRow: ProviderBridgeRow = {
            tracking_id: trackingId,
            provider_id: providerId,
            provider_name: provider.provider_name,
            email: effectiveEmail,
            city: provider.city,
            state: provider.state,
            category: provider.provider_category,
            slug: provider.slug,
            claim_url: context.claim_url,
            profile_url: context.profile_url,
            manage_url: context.manage_url,
            remove_url: context.remove_url,
            unsubscribe_url: context.unsubscribe_url,
            gap_list: gapList,
            city_views: cityViews,
            decision_maker_first_name: apolloFirstName,
          };

          if (!providersByState.has(state)) {
            providersByState.set(state, []);
          }
          providersByState.get(state)!.push(bridgeRow);
        }

        // Launch SmartLead campaigns per state
        // First, look up existing campaigns for each state to enable reuse (same month)
        const existingCampaignsByState = new Map<string, number[]>();
        for (const state of providersByState.keys()) {
          const campaignName = generateCampaignName(state);
          // Find tracking records with smartlead_data for the SAME campaign name (same state + month)
          const { data: existingRecords } = await db
            .from("provider_outreach_tracking")
            .select("smartlead_data")
            .eq("smartlead_data->>campaign_name", campaignName)
            .not("smartlead_data", "is", null)
            .limit(10);

          const campaignIds = [...new Set(
            (existingRecords ?? [])
              .map((r) => (r.smartlead_data as { campaign_id?: number })?.campaign_id)
              .filter((id): id is number => id != null)
          )];
          if (campaignIds.length > 0) {
            existingCampaignsByState.set(state, campaignIds);
          }
        }

        for (const [state, stateProviders] of providersByState) {
          const campaignName = generateCampaignName(state);
          const existingCampaignIds = existingCampaignsByState.get(state) ?? [];

          try {
            // If we have existing campaigns for this state, try to enroll into them first
            // Otherwise create a new campaign
            let report: Awaited<ReturnType<typeof launchProviderCampaign>>;

            if (existingCampaignIds.length > 0 && stateProviders.length === 1) {
              // Single provider: use enrollProviderIntoCampaign for efficiency
              const enrollResult = await enrollProviderIntoCampaign({
                provider: stateProviders[0],
                campaignName,
                existingCampaignIds,
              });

              // Convert single-provider result to batch report format
              report = {
                ok: enrollResult.ok,
                campaign_id: enrollResult.campaign_id,
                enrolled: enrollResult.enrolled ? 1 : 0,
                enrolled_tracking_ids: enrollResult.enrolled ? [stateProviders[0].tracking_id] : [],
                skipped: enrollResult.skipped_reason
                  ? [{ tracking_id: stateProviders[0].tracking_id, provider_id: stateProviders[0].provider_id, reason: enrollResult.skipped_reason }]
                  : [],
                mailbox_warnings: enrollResult.mailbox_warnings,
                errors: enrollResult.errors,
              };
            } else {
              // Multiple providers or no existing campaigns: batch launch
              report = await launchProviderCampaign({
                campaignName,
                providers: stateProviders,
              });
            }

            if (report.ok && report.campaign_id) {
              // Update tracking records with SmartLead data
              for (const trackingId of report.enrolled_tracking_ids) {
                const provider = stateProviders.find((p) => p.tracking_id === trackingId);
                if (provider) {
                  const smartleadData: ProviderSmartleadData = {
                    campaign_id: report.campaign_id,
                    lead_email: provider.email!,
                    enrolled_at: new Date().toISOString(),
                    campaign_name: campaignName,
                  };

                  await db
                    .from("provider_outreach_tracking")
                    .update({ smartlead_data: smartleadData })
                    .eq("id", trackingId);

                  // Log touchpoint
                  await db.from("provider_outreach_touchpoints").insert({
                    provider_id: provider.provider_id,
                    touchpoint_type: "smartlead_enrolled",
                    admin_user_id: adminUser.id,
                    details: {
                      campaign_id: report.campaign_id,
                      campaign_name: campaignName,
                      lead_email: provider.email,
                    },
                  });

                  launchedProviders.push(provider.provider_id);
                }
              }

              // Handle skipped providers
              for (const skipped of report.skipped) {
                failedProviders.push({
                  provider_id: stateProviders.find((p) => p.tracking_id === skipped.tracking_id)?.provider_id || skipped.tracking_id,
                  error: `SmartLead: ${skipped.reason}`,
                });
              }
            } else {
              // Campaign creation failed
              for (const provider of stateProviders) {
                failedProviders.push({
                  provider_id: provider.provider_id,
                  error: `SmartLead campaign failed: ${report.errors.map((e) => e.message).join(", ")}`,
                });
              }
            }
          } catch (err) {
            console.error(`Failed to launch SmartLead campaign for ${state}:`, err);
            for (const provider of stateProviders) {
              failedProviders.push({
                provider_id: provider.provider_id,
                error: err instanceof Error ? err.message : "SmartLead error",
              });
            }
          }
        }

        return NextResponse.json({
          success: true,
          launched: launchedProviders.length,
          failed: failedProviders.length,
          launched_providers: launchedProviders,
          failed_providers: failedProviders,
          engine: "smartlead",
          schedule: PROVIDER_OUTREACH_CADENCE.map((s) => ({
            day: s.day,
            templateKey: s.templateKey,
            description: s.description,
          })),
        });
      }

      // Legacy: Create tasks for each cadence step (when SmartLead not configured)
      for (const [providerId, { trackingId, preview, variantAssignment, apolloEmail }] of trackingRecords) {
        try {
          // Use Apollo email if requested and available, otherwise use provider's generic email
          const effectiveEmail = (use_apollo_email && apolloEmail) ? apolloEmail : preview.email;

          const taskRows = schedule.map((step) => {
            const payload: Record<string, unknown> = {
              recipient_email: effectiveEmail,
              provider_name: preview.provider_name,
              city: preview.city,
              state: preview.state,
              category: preview.category,
            };

            // Include variant_id in Day 0 task payload for auto-send executor
            if (step.templateKey === "intro" && variantAssignment) {
              payload.variant_id = variantAssignment.variant_id;
              payload.variant_key = variantAssignment.variant_key;
            }

            return {
              tracking_id: trackingId,
              provider_id: providerId,
              task_type: "outreach_email_send",
              cadence_day: step.day,
              template_key: step.templateKey,
              due_at: step.dueAt.toISOString(),
              status: "pending",
              payload,
            };
          });

          const { error: tasksError } = await db
            .from("provider_outreach_tasks")
            .insert(taskRows);

          if (tasksError) throw tasksError;

          // Log touchpoint (non-fatal - don't fail the sequence if touchpoint fails)
          const touchpointDetails: Record<string, unknown> = {
            email_count: taskRows.length,
            first_due_at: schedule[0].dueAt.toISOString(),
            last_due_at: schedule[schedule.length - 1].dueAt.toISOString(),
          };

          // Include variant info in touchpoint if assigned
          if (variantAssignment) {
            touchpointDetails.variant_id = variantAssignment.variant_id;
            touchpointDetails.variant_key = variantAssignment.variant_key;
          }

          const { error: touchpointError } = await db.from("provider_outreach_touchpoints").insert({
            provider_id: providerId,
            touchpoint_type: "sequence_launched",
            admin_user_id: adminUser.id,
            details: touchpointDetails,
          });

          if (touchpointError) {
            console.warn(`[launch-sequence] Failed to log touchpoint for ${providerId}:`, touchpointError);
          }

          launchedProviders.push(providerId);
        } catch (err) {
          console.error(`Failed to launch sequence for ${providerId}:`, err);
          failedProviders.push({
            provider_id: providerId,
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      return NextResponse.json({
        success: true,
        launched: launchedProviders.length,
        failed: failedProviders.length,
        launched_providers: launchedProviders,
        failed_providers: failedProviders,
        engine: "resend",
        schedule: schedule.map((s) => ({
          day: s.day,
          templateKey: s.templateKey,
          dueAt: s.dueAt.toISOString(),
        })),
      });
    }

    // Determine which engine will be used and get sender info
    // Must match getProviderSenderEmails() logic in smartlead-bridge.ts
    // (useSmartLead is already defined at the top of this function)
    const providerSenders = process.env.PROVIDER_OUTREACH_SMARTLEAD_SENDERS ?? "";
    const generalSenders = process.env.SMARTLEAD_SENDER_EMAILS ?? "";
    const smartleadSenderList = providerSenders.trim()
      ? providerSenders.split(",").map((s) => s.trim()).filter(Boolean)
      : generalSenders.split(",").map((s) => s.trim()).filter(Boolean);

    const senderInfo = useSmartLead && smartleadSenderList.length > 0
      ? {
          engine: "smartlead" as const,
          from: `Dr. Logan DuBose <${smartleadSenderList[0]}>`,
          senders: smartleadSenderList,
        }
      : {
          engine: "resend" as const,
          from: PROVIDER_OUTREACH_FROM,
          senders: [PROVIDER_OUTREACH_FROM],
        };

    return NextResponse.json({
      dry_run: true,
      providers: previews,
      schedule: schedule.map((s) => ({
        day: s.day,
        templateKey: s.templateKey,
        dueAt: s.dueAt.toISOString(),
      })),
      summary: {
        total: validProviderIds.length,
        valid: validCount,
        invalid: invalidCount,
      },
      cadence: PROVIDER_OUTREACH_CADENCE.map((step) => ({
        day: step.day,
        templateKey: step.templateKey,
        description: step.description,
      })),
      sender: senderInfo,
    });
  } catch (error) {
    console.error("Error in launch-sequence:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/provider-outreach/launch-sequence
 *
 * Returns the cadence configuration for reference.
 */
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminUser = await getAdminUser(user.id);
    if (!adminUser) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({
      cadence: PROVIDER_OUTREACH_CADENCE.map((step) => ({
        day: step.day,
        templateKey: step.templateKey,
        description: step.description,
      })),
      note: "POST with provider_ids array to preview emails for specific providers",
    });
  } catch (error) {
    console.error("Error in launch-sequence GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
