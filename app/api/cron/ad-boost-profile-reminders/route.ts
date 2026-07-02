import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/admin";
import { sendAdBoostRequestEmail } from "@/lib/ad-boost/notifications.server";
import { evaluateAdBoostEligibility } from "@/lib/ad-boost/eligibility";
import { withCronRun } from "@/lib/crons/run";
import { sendSlackAlert, slackAdBoostRequested } from "@/lib/slack";
import type { ExtendedMetadata, ReviewsSummary, ResponseRateSummary } from "@/lib/profile-completeness";
import type { Profile } from "@/lib/types";

export const maxDuration = 60;

const JOB_ID = "ad-boost-profile-reminders";
const REMINDER_AFTER_HOURS = 48;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

const REQUEST_SELECT =
  "id, provider_id, provider_slug, display_name, requested_setup_week, completeness_at_submit, status, channel, intended_monthly_budget, created_at, profile_reminder_email_sent_at";

const PROFILE_SELECT =
  "id, slug, source_provider_id, display_name, email, category, description, image_url, address, city, state, care_types, metadata, verification_state";

interface RequestRow {
  id: string;
  provider_id: string;
  provider_slug: string | null;
  display_name: string | null;
  requested_setup_week: string;
  completeness_at_submit: number | null;
  status: string;
  channel: string | null;
  intended_monthly_budget: number | null;
  created_at: string;
  profile_reminder_email_sent_at: string | null;
}

interface ProfileRow {
  id: string;
  slug: string | null;
  source_provider_id: string | null;
  display_name: string | null;
  email: string | null;
  category: string | null;
  description: string | null;
  image_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  care_types: string[] | null;
  metadata: Record<string, unknown> | null;
  verification_state: string | null;
}

interface SourceProviderRow {
  provider_id: string;
  email: string | null;
  google_reviews_data: { rating?: number | null; review_count?: number | null } | null;
  google_rating: number | null;
  provider_images: string | null;
  provider_logo: string | null;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");
  const dryRun = searchParams.get("dry_run") === "true";
  const isAuthed =
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    querySecret === process.env.CRON_SECRET;

  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withCronRun(JOB_ID, async () => {
    const db = getServiceClient();
    const cutoff = new Date(Date.now() - REMINDER_AFTER_HOURS * 60 * 60 * 1000).toISOString();

    const counts = {
      processed: 0,
      reminded: 0,
      promoted: 0,
      skipped_missing_profile: 0,
      skipped_missing_email: 0,
      skipped_already_sent: 0,
      skipped_not_pending: 0,
      errors: 0,
    };

    const { data: requests, error: requestError } = await db
      .from("ad_campaign_requests")
      .select(REQUEST_SELECT)
      .eq("status", "pending_profile")
      .is("profile_reminder_email_sent_at", null)
      .lte("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(100);

    if (requestError) {
      console.error("[cron/ad-boost-profile-reminders] request fetch failed:", requestError);
      throw requestError;
    }

    const staleRequests = (requests ?? []) as RequestRow[];
    counts.processed = staleRequests.length;

    if (staleRequests.length === 0) {
      return { ok: true, dry_run: dryRun, ...counts };
    }

    const profileIds = [...new Set(staleRequests.map((r) => r.provider_id).filter(Boolean))];
    const { data: profileRows, error: profileError } = await db
      .from("business_profiles")
      .select(PROFILE_SELECT)
      .in("id", profileIds);

    if (profileError) {
      console.error("[cron/ad-boost-profile-reminders] profile fetch failed:", profileError);
      throw profileError;
    }

    const profiles = ((profileRows ?? []) as ProfileRow[]);
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    const sourceIds = [...new Set(profiles.map((p) => p.source_provider_id).filter(Boolean))] as string[];
    const sourceById = new Map<string, SourceProviderRow>();
    if (sourceIds.length > 0) {
      const { data: sourceRows, error: sourceError } = await db
        .from("olera-providers")
        .select("provider_id, email, google_reviews_data, google_rating, provider_images, provider_logo")
        .in("provider_id", sourceIds);
      if (sourceError) {
        console.error("[cron/ad-boost-profile-reminders] source provider fetch failed:", sourceError);
      } else {
        for (const row of (sourceRows ?? []) as SourceProviderRow[]) {
          sourceById.set(row.provider_id, row);
        }
      }
    }

    const variantToProfileId = new Map<string, string>();
    for (const profile of profiles) {
      for (const variant of [profile.id, profile.slug, profile.source_provider_id]) {
        if (variant) variantToProfileId.set(variant, profile.id);
      }
    }
    const variants = [...variantToProfileId.keys()];

    const reviewsByProfileId = new Map<string, { sum: number; count: number }>();
    const questionsByProfileId = new Map<string, { total: number; answered: number }>();
    if (variants.length > 0) {
      const ninetyDaysAgo = new Date(Date.now() - NINETY_DAYS_MS).toISOString();
      const [reviewsRes, questionsRes] = await Promise.all([
        db
          .from("reviews")
          .select("provider_id, rating")
          .in("provider_id", variants)
          .eq("status", "published")
          .limit(1000),
        db
          .from("provider_questions")
          .select("provider_id, answer, created_at")
          .in("provider_id", variants)
          .gte("created_at", ninetyDaysAgo)
          .limit(1000),
      ]);

      if (!reviewsRes.error) {
        for (const review of (reviewsRes.data ?? []) as Array<{ provider_id: string | null; rating: number | null }>) {
          if (!review.provider_id || review.rating == null) continue;
          const profileId = variantToProfileId.get(review.provider_id);
          if (!profileId) continue;
          const agg = reviewsByProfileId.get(profileId) ?? { sum: 0, count: 0 };
          agg.sum += review.rating;
          agg.count += 1;
          reviewsByProfileId.set(profileId, agg);
        }
      }
      if (!questionsRes.error) {
        for (const question of (questionsRes.data ?? []) as Array<{ provider_id: string | null; answer: string | null }>) {
          if (!question.provider_id) continue;
          const profileId = variantToProfileId.get(question.provider_id);
          if (!profileId) continue;
          const agg = questionsByProfileId.get(profileId) ?? { total: 0, answered: 0 };
          agg.total += 1;
          if (question.answer?.trim()) agg.answered += 1;
          questionsByProfileId.set(profileId, agg);
        }
      }
    }

    for (const stale of staleRequests) {
      const profile = profileById.get(stale.provider_id);
      if (!profile?.slug) {
        counts.skipped_missing_profile++;
        continue;
      }

      const sourceProvider = profile.source_provider_id ? sourceById.get(profile.source_provider_id) : null;
      const metadata = enrichMetadataWithSourceImages(profile.metadata ?? {}, sourceProvider);
      const reviews = buildReviews(profile, sourceProvider, reviewsByProfileId);
      const responseRate = buildResponseRate(profile, questionsByProfileId);
      const eligibility = evaluateAdBoostEligibility(
        profile as unknown as Profile,
        metadata,
        reviews,
        responseRate,
      );
      const isVerified =
        profile.verification_state === "verified" ||
        profile.verification_state === "not_required";
      const email = profile.email || sourceProvider?.email || null;

      if (!email) {
        counts.skipped_missing_email++;
        continue;
      }

      try {
        if (eligibility.eligible && isVerified) {
          if (dryRun) {
            counts.promoted++;
            continue;
          }

          const { data: promoted, error: promoteError } = await db
            .from("ad_campaign_requests")
            .update({
              status: "requested",
              completeness_at_submit: eligibility.overall,
              updated_at: new Date().toISOString(),
            })
            .eq("id", stale.id)
            .eq("status", "pending_profile")
            .select("id, requested_setup_week, channel, intended_monthly_budget")
            .maybeSingle();

          if (promoteError) {
            counts.errors++;
            console.error(`[cron/ad-boost-profile-reminders] promotion failed for request ${stale.id}:`, promoteError);
            continue;
          }

          if (!promoted) {
            counts.skipped_not_pending++;
            continue;
          }

          const alert = slackAdBoostRequested({
            requestId: stale.id,
            providerName: profile.display_name ?? profile.slug,
            providerSlug: profile.slug,
            city: profile.city,
            state: profile.state,
            category: profile.category,
            completeness: eligibility.overall,
            setupWeek: stale.requested_setup_week,
            channel: stale.channel,
            budget: stale.intended_monthly_budget,
            launchReady: true,
          });
          await sendSlackAlert(alert.text, alert.blocks);
          await sendAdBoostRequestEmail({
            requestId: stale.id,
            kind: "promotion",
            providerName: profile.display_name ?? profile.slug,
            providerSlug: profile.slug,
            providerEmail: email,
            setupWeek: stale.requested_setup_week,
            channel: stale.channel,
            intendedMonthlyBudget: stale.intended_monthly_budget,
            completeness: eligibility.overall,
            eligibility,
            isVerified,
          });
          counts.promoted++;
          continue;
        }

        if (dryRun) {
          counts.reminded++;
          continue;
        }

        const result = await sendAdBoostRequestEmail({
          requestId: stale.id,
          kind: "profile_reminder",
          providerName: profile.display_name ?? profile.slug,
          providerSlug: profile.slug,
          providerEmail: email,
          setupWeek: stale.requested_setup_week,
          channel: stale.channel,
          intendedMonthlyBudget: stale.intended_monthly_budget,
          completeness: eligibility.overall,
          eligibility,
          isVerified,
        });

        if (result.sent) {
          counts.reminded++;
        } else if (result.skipped === "already_sent") {
          counts.skipped_already_sent++;
        } else {
          counts.errors++;
        }
      } catch (err) {
        counts.errors++;
        console.error(`[cron/ad-boost-profile-reminders] failed for request ${stale.id}:`, err);
      }
    }

    return { ok: true, dry_run: dryRun, ...counts };
  });
}

function enrichMetadataWithSourceImages(
  metadata: Record<string, unknown>,
  sourceProvider: SourceProviderRow | null | undefined,
): ExtendedMetadata {
  const baseImages = Array.isArray(metadata.images) ? metadata.images : [];
  if (baseImages.length > 0 || !sourceProvider) {
    return metadata as ExtendedMetadata;
  }
  const sourceImages =
    typeof sourceProvider.provider_images === "string"
      ? sourceProvider.provider_images.split(" | ").map((s) => s.trim()).filter(Boolean)
      : [];
  const images = sourceProvider.provider_logo
    ? [sourceProvider.provider_logo, ...sourceImages]
    : sourceImages;
  return { ...metadata, images } as ExtendedMetadata;
}

function buildReviews(
  profile: ProfileRow,
  sourceProvider: SourceProviderRow | null | undefined,
  reviewsByProfileId: Map<string, { sum: number; count: number }>,
): ReviewsSummary {
  const olera = reviewsByProfileId.get(profile.id) ?? { sum: 0, count: 0 };
  const oleraAvg = olera.count > 0 ? olera.sum / olera.count : null;
  const googleRating =
    sourceProvider?.google_reviews_data?.rating ?? sourceProvider?.google_rating ?? null;
  const googleCount = sourceProvider?.google_reviews_data?.review_count ?? 0;
  const totalCount = olera.count + googleCount;

  let avgRating: number | null = null;
  if (oleraAvg !== null && googleRating !== null && totalCount > 0) {
    avgRating = (oleraAvg * olera.count + googleRating * googleCount) / totalCount;
  } else if (oleraAvg !== null) {
    avgRating = oleraAvg;
  } else if (googleRating !== null) {
    avgRating = googleRating;
  }

  return {
    count: totalCount,
    avgRating: avgRating !== null ? Math.round(avgRating * 10) / 10 : null,
  };
}

function buildResponseRate(
  profile: ProfileRow,
  questionsByProfileId: Map<string, { total: number; answered: number }>,
): ResponseRateSummary {
  const questions = questionsByProfileId.get(profile.id) ?? { total: 0, answered: 0 };
  return {
    totalQuestions: questions.total,
    answeredCount: questions.answered,
  };
}
