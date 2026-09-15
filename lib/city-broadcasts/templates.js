"use strict";
/**
 * City Broadcasts - Email Templates
 *
 * Two email templates for city broadcasts:
 * 1. Question broadcast: "A family has a question about {category} in {city}"
 * 2. Profile broadcast: "A family just published their profile in {city}"
 *
 * These templates are designed to match the high-converting questionReceivedEmail
 * pattern - making providers feel like they have a question to answer, not just
 * a profile to claim.
 *
 * Uses polishedLayout() from provider-outreach for consistent Olera branding.
 * Uses generateClaimUrl() for one-click claiming with signed tokens.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderQuestionBroadcast = renderQuestionBroadcast;
exports.renderProfileBroadcast = renderProfileBroadcast;
var email_utils_1 = require("@/lib/provider-outreach/email-utils");
var claim_tokens_1 = require("@/lib/claim-tokens");
var BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://olera.care";
/**
 * Trust introduction matching the direct question email.
 * Establishes credibility (NIH-backed) before asking for action.
 */
function trustIntro() {
    return "<p style=\"font-size:14px;color:#6b7280;margin:0 0 20px;line-height:1.6;\">Olera is an NIH-backed platform helping families find quality senior care providers like you. Families in your area are actively researching care options.</p>";
}
/**
 * Render the question broadcast email.
 * Sent when a family asks a question in a city with dormant providers.
 *
 * Designed to match the high-converting questionReceivedEmail pattern:
 * - Same subject line structure ("A family has a question about...")
 * - Trust intro (NIH-backed)
 * - Question in styled box
 * - "View and respond" CTA (not "Claim your profile")
 */
function renderQuestionBroadcast(ctx) {
    var categoryLabel = ctx.category || "care";
    var escapedCategory = escapeHtml(categoryLabel);
    var escapedCity = escapeHtml(ctx.city);
    // Match the direct question email subject pattern
    var subject = "A family has a question about ".concat(categoryLabel, " in ").concat(ctx.city);
    var preheader = ctx.questionText
        ? "\"".concat(truncateQuestion(ctx.questionText, 60), "\"")
        : "Someone is researching ".concat(categoryLabel, " options in your area.");
    // Use generateClaimUrl for one-click claiming with signed token
    // Pass "city_broadcast" source for analytics tracking
    var claimUrl = (0, claim_tokens_1.generateClaimUrl)(ctx.providerId, ctx.providerSlug, ctx.providerEmail, BASE_URL, "city_broadcast");
    var viewListingUrl = "".concat(BASE_URL, "/provider/").concat(ctx.providerSlug);
    // Use slug-based unsubscribe URL with cold_outreach type (city broadcasts are cold outreach)
    var unsubscribeUrl = "".concat(BASE_URL, "/unsubscribe/").concat(ctx.providerSlug, "?type=cold_outreach");
    // Build the question display - match the direct email styling
    // Only show "and asked:" if we have the actual question text
    var questionSection = ctx.questionText
        ? "\n    <p style=\"font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;\">\n      A family is researching ".concat(escapedCategory, " options and asked:\n    </p>\n    <div style=\"background:#f9fafb;padding:16px;border-radius:12px;margin:0 0 16px;\">\n      <p style=\"font-size:15px;color:#111827;margin:0;line-height:1.5;font-style:italic;\">&ldquo;").concat(escapeHtml(ctx.questionText), "&rdquo;</p>\n    </div>")
        : "\n    <p style=\"font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;\">\n      A family is researching ".concat(escapedCategory, " options in your area and has questions.\n    </p>");
    var bodyHtml = "\n    <h1 style=\"font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;\">A family has a question about ".concat(escapedCategory, " in ").concat(escapedCity, "</h1>\n    ").concat(trustIntro(), "\n    ").concat(questionSection, "\n    <p style=\"font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;\">\n      Families like this are actively searching in your area. Make sure your profile stands out.\n    </p>\n    <table cellpadding=\"0\" cellspacing=\"0\" style=\"margin:0 0 24px;\">\n      <tr>\n        <td style=\"background:#198087;border-radius:8px;\">\n          <a href=\"").concat(claimUrl, "\" style=\"display:inline-block;padding:14px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;\">\n            Get started &rarr;\n          </a>\n        </td>\n      </tr>\n    </table>\n  ").trim();
    var footerHtml = buildFooter(viewListingUrl, unsubscribeUrl);
    var html = (0, email_utils_1.polishedLayout)(bodyHtml, footerHtml, {
        preheader: preheader,
    });
    return { subject: subject, preheader: preheader, html: html };
}
/**
 * HTML-escape text to prevent XSS in email content.
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
/**
 * Render the profile broadcast email.
 * Sent when a family publishes their care-seeker profile in a city.
 *
 * Framed as "you're being considered" to create urgency - the provider
 * feels like they're already on someone's shortlist and need to respond.
 */
function renderProfileBroadcast(ctx) {
    var categoryLabel = ctx.category || "care";
    var escapedCategory = escapeHtml(categoryLabel);
    var escapedCity = escapeHtml(ctx.city);
    var subject = "A family in ".concat(ctx.city, " added you to their list");
    var preheader = "You're being considered by a family looking for ".concat(categoryLabel, ".");
    // Use generateClaimUrl for one-click claiming with signed token
    // Pass "city_broadcast" source for analytics tracking
    var claimUrl = (0, claim_tokens_1.generateClaimUrl)(ctx.providerId, ctx.providerSlug, ctx.providerEmail, BASE_URL, "city_broadcast");
    var viewListingUrl = "".concat(BASE_URL, "/provider/").concat(ctx.providerSlug);
    // Use slug-based unsubscribe URL with cold_outreach type (city broadcasts are cold outreach)
    var unsubscribeUrl = "".concat(BASE_URL, "/unsubscribe/").concat(ctx.providerSlug, "?type=cold_outreach");
    var bodyHtml = "\n    <h1 style=\"font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;\">A family in ".concat(escapedCity, " added you to their list</h1>\n    ").concat(trustIntro(), "\n    <p style=\"font-size:15px;color:#374151;margin:0 0 16px;line-height:1.5;\">\n      A family looking for ").concat(escapedCategory, " is comparing providers in your area \u2014 and you're on their shortlist.\n    </p>\n    <p style=\"font-size:14px;color:#6b7280;margin:0 0 24px;line-height:1.5;\">\n      Introduce yourself and learn more about what they're looking for.\n    </p>\n    <table cellpadding=\"0\" cellspacing=\"0\" style=\"margin:0 0 24px;\">\n      <tr>\n        <td style=\"background:#198087;border-radius:8px;\">\n          <a href=\"").concat(claimUrl, "\" style=\"display:inline-block;padding:14px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;\">\n            Connect with them &rarr;\n          </a>\n        </td>\n      </tr>\n    </table>\n  ").trim();
    var footerHtml = buildFooter(viewListingUrl, unsubscribeUrl);
    var html = (0, email_utils_1.polishedLayout)(bodyHtml, footerHtml, {
        preheader: preheader,
    });
    return { subject: subject, preheader: preheader, html: html };
}
/**
 * Build the email footer with view listing link and unsubscribe.
 * Matches the offRampBlock pattern from questionReceivedEmail.
 */
function buildFooter(viewListingUrl, unsubscribeUrl) {
    return "\n    <div style=\"margin-top:24px;padding-top:16px;border-top:1px solid #f3f4f6;\">\n      <p style=\"font-size:13px;color:#9ca3af;margin:0 0 6px;line-height:1.5;\">\n        Not the right contact? Please forward this to the appropriate person on your team.\n      </p>\n      <p style=\"font-size:12px;color:#9ca3af;margin:0;\">\n        <a href=\"".concat(viewListingUrl, "\" style=\"color:#9ca3af;text-decoration:underline;\">View listing</a>\n        &middot; <a href=\"").concat(unsubscribeUrl, "\" style=\"color:#9ca3af;text-decoration:underline;\">Unsubscribe</a>\n      </p>\n    </div>\n  ").trim();
}
/**
 * Truncate question text for the email preview.
 */
function truncateQuestion(text, maxLen) {
    if (maxLen === void 0) { maxLen = 100; }
    var cleaned = text.trim().replace(/\s+/g, " ");
    if (cleaned.length <= maxLen)
        return cleaned;
    return cleaned.slice(0, maxLen).trim() + "...";
}
