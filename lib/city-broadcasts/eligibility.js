"use strict";
/**
 * City Broadcasts - Provider Eligibility Checks
 *
 * Determines which providers should receive broadcast emails when family
 * activity occurs in their city.
 *
 * IMPORTANT: Only providers in the 'broadcast_ready' stage are eligible.
 * Admins must explicitly move providers to this stage after verifying:
 *   - At least 1 email successfully delivered
 *   - Zero bounces
 *   - Zero complaints
 *   - Admin has called the provider
 *
 * Additional filters applied here:
 *   - Bounced/complained addresses (double-check)
 *   - Recently contacted providers (7 days for broadcasts, 30 days for direct questions)
 *   - Providers with active connections
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findEligibleProviders = findEligibleProviders;
var admin_1 = require("@/lib/admin");
/** Only providers in broadcast_ready stage are eligible for city broadcasts */
var ELIGIBLE_STAGE = "broadcast_ready";
/** Days before a provider can receive another broadcast */
var BROADCAST_COOLDOWN_DAYS = 7;
/** Days before a provider who received a direct question can get a broadcast */
var QUESTION_COOLDOWN_DAYS = 30;
/** Days to consider a connection "active" */
var CONNECTION_ACTIVE_DAYS = 30;
/**
 * Find providers eligible for a city broadcast.
 *
 * @param city - City to find providers in
 * @param category - Optional category filter (for question broadcasts)
 * @param limit - Maximum providers to return (default 50)
 */
function findEligibleProviders(city_1, category_1) {
    return __awaiter(this, arguments, void 0, function (city, category, limit) {
        var db, excluded, _a, trackingRows, trackingError, validTrackingRows, providerIds, providerQuery, _b, providers, providerError, trackingByProviderId, providerByProviderId, candidates, _i, validTrackingRows_1, tracking, provider, apolloContact, email, emails, candidateProviderIds, bouncedEmails, recentBroadcastProviders, recentQuestionProviders, activeConnectionProviders, eligible, _c, candidates_1, candidate;
        if (limit === void 0) { limit = 50; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    db = (0, admin_1.getServiceClient)();
                    excluded = {
                        no_email: 0,
                        bounced: 0,
                        recent_broadcast: 0,
                        recent_question: 0,
                        active_connection: 0,
                        excluded_stage: 0,
                    };
                    return [4 /*yield*/, db
                            .from("provider_outreach_tracking")
                            .select("provider_id, stage, apollo_contact, city, state")
                            .ilike("city", city)
                            .eq("stage", ELIGIBLE_STAGE)
                            .limit(limit * 3)];
                case 1:
                    _a = _d.sent(), trackingRows = _a.data, trackingError = _a.error;
                    if (trackingError) {
                        console.error("[city-broadcasts] Failed to find tracking rows:", trackingError);
                        return [2 /*return*/, { eligible: [], excluded: excluded }];
                    }
                    if (!trackingRows || trackingRows.length === 0) {
                        return [2 /*return*/, { eligible: [], excluded: excluded }];
                    }
                    validTrackingRows = trackingRows;
                    if (validTrackingRows.length === 0) {
                        return [2 /*return*/, { eligible: [], excluded: excluded }];
                    }
                    providerIds = validTrackingRows.map(function (r) { return r.provider_id; });
                    providerQuery = db
                        .from("olera-providers")
                        .select("provider_id, provider_name, slug, city, state, provider_category, email")
                        .in("provider_id", providerIds)
                        .or("deleted.is.null,deleted.eq.false");
                    // Filter by category if provided
                    if (category) {
                        providerQuery = providerQuery.ilike("provider_category", "%".concat(category, "%"));
                    }
                    return [4 /*yield*/, providerQuery];
                case 2:
                    _b = _d.sent(), providers = _b.data, providerError = _b.error;
                    if (providerError) {
                        console.error("[city-broadcasts] Failed to fetch providers:", providerError);
                        return [2 /*return*/, { eligible: [], excluded: excluded }];
                    }
                    if (!providers || providers.length === 0) {
                        return [2 /*return*/, { eligible: [], excluded: excluded }];
                    }
                    trackingByProviderId = new Map(validTrackingRows.map(function (r) { return [r.provider_id, r]; }));
                    providerByProviderId = new Map(providers.map(function (p) { return [p.provider_id, p]; }));
                    candidates = [];
                    for (_i = 0, validTrackingRows_1 = validTrackingRows; _i < validTrackingRows_1.length; _i++) {
                        tracking = validTrackingRows_1[_i];
                        provider = providerByProviderId.get(tracking.provider_id);
                        if (!provider)
                            continue;
                        apolloContact = tracking.apollo_contact;
                        email = (apolloContact === null || apolloContact === void 0 ? void 0 : apolloContact.email) || provider.email;
                        if (!email) {
                            excluded.no_email++;
                            continue;
                        }
                        candidates.push({
                            provider_id: tracking.provider_id,
                            email: email,
                            name: provider.provider_name || "Provider",
                            slug: provider.slug || "",
                            city: provider.city || city,
                            state: provider.state || null,
                            category: provider.provider_category || null,
                        });
                    }
                    if (candidates.length === 0) {
                        return [2 /*return*/, { eligible: [], excluded: excluded }];
                    }
                    emails = candidates.map(function (c) { return c.email; });
                    candidateProviderIds = candidates.map(function (c) { return c.provider_id; });
                    return [4 /*yield*/, getBouncedEmails(db, emails)];
                case 3:
                    bouncedEmails = _d.sent();
                    return [4 /*yield*/, getRecentBroadcastProviders(db, candidateProviderIds, BROADCAST_COOLDOWN_DAYS)];
                case 4:
                    recentBroadcastProviders = _d.sent();
                    return [4 /*yield*/, getRecentQuestionProviders(db, candidateProviderIds, QUESTION_COOLDOWN_DAYS)];
                case 5:
                    recentQuestionProviders = _d.sent();
                    return [4 /*yield*/, getActiveConnectionProviders(db, candidateProviderIds, CONNECTION_ACTIVE_DAYS)];
                case 6:
                    activeConnectionProviders = _d.sent();
                    eligible = [];
                    for (_c = 0, candidates_1 = candidates; _c < candidates_1.length; _c++) {
                        candidate = candidates_1[_c];
                        // Check bounced/complained
                        if (bouncedEmails.has(candidate.email.toLowerCase())) {
                            excluded.bounced++;
                            continue;
                        }
                        // Check recent broadcast
                        if (recentBroadcastProviders.has(candidate.provider_id)) {
                            excluded.recent_broadcast++;
                            continue;
                        }
                        // Check recent direct question
                        if (recentQuestionProviders.has(candidate.provider_id)) {
                            excluded.recent_question++;
                            continue;
                        }
                        // Check active connection
                        if (activeConnectionProviders.has(candidate.provider_id)) {
                            excluded.active_connection++;
                            continue;
                        }
                        eligible.push(candidate);
                        if (eligible.length >= limit)
                            break;
                    }
                    return [2 /*return*/, { eligible: eligible, excluded: excluded }];
            }
        });
    });
}
/**
 * Get emails that have bounced or received complaints.
 */
function getBouncedEmails(db, emails) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (emails.length === 0)
                        return [2 /*return*/, new Set()];
                    return [4 /*yield*/, db
                            .from("email_log")
                            .select("recipient")
                            .in("recipient", emails)
                            .or("bounced_at.not.is.null,complained_at.not.is.null")];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error) {
                        console.error("[city-broadcasts] Failed to check bounced emails:", error);
                        return [2 /*return*/, new Set()];
                    }
                    return [2 /*return*/, new Set((data || []).map(function (r) { return r.recipient.toLowerCase(); }))];
            }
        });
    });
}
/**
 * Get providers who received a city broadcast in the last N days.
 */
function getRecentBroadcastProviders(db, providerIds, days) {
    return __awaiter(this, void 0, void 0, function () {
        var cutoff, _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (providerIds.length === 0)
                        return [2 /*return*/, new Set()];
                    cutoff = new Date();
                    cutoff.setDate(cutoff.getDate() - days);
                    return [4 /*yield*/, db
                            .from("city_broadcast_recipients")
                            .select("provider_id")
                            .in("provider_id", providerIds)
                            .eq("status", "sent")
                            .gte("created_at", cutoff.toISOString())];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error) {
                        console.error("[city-broadcasts] Failed to check recent broadcasts:", error);
                        return [2 /*return*/, new Set()];
                    }
                    return [2 /*return*/, new Set((data || []).map(function (r) { return r.provider_id; }))];
            }
        });
    });
}
/**
 * Get providers who received a direct question notification in the last N days.
 */
function getRecentQuestionProviders(db, providerIds, days) {
    return __awaiter(this, void 0, void 0, function () {
        var cutoff, _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (providerIds.length === 0)
                        return [2 /*return*/, new Set()];
                    cutoff = new Date();
                    cutoff.setDate(cutoff.getDate() - days);
                    return [4 /*yield*/, db
                            .from("email_log")
                            .select("provider_id")
                            .in("provider_id", providerIds)
                            .eq("email_type", "question_received")
                            .eq("status", "sent")
                            .gte("created_at", cutoff.toISOString())];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error) {
                        console.error("[city-broadcasts] Failed to check recent questions:", error);
                        return [2 /*return*/, new Set()];
                    }
                    return [2 /*return*/, new Set((data || []).filter(function (r) { return r.provider_id; }).map(function (r) { return r.provider_id; }))];
            }
        });
    });
}
/**
 * Get providers with active connections in the last N days.
 */
function getActiveConnectionProviders(db, providerIds, days) {
    return __awaiter(this, void 0, void 0, function () {
        var cutoff, _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (providerIds.length === 0)
                        return [2 /*return*/, new Set()];
                    cutoff = new Date();
                    cutoff.setDate(cutoff.getDate() - days);
                    return [4 /*yield*/, db
                            .from("connections")
                            .select("provider_id")
                            .in("provider_id", providerIds)
                            .in("status", ["pending", "active", "accepted"])
                            .gte("created_at", cutoff.toISOString())];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error) {
                        console.error("[city-broadcasts] Failed to check active connections:", error);
                        return [2 /*return*/, new Set()];
                    }
                    return [2 /*return*/, new Set((data || []).filter(function (r) { return r.provider_id; }).map(function (r) { return r.provider_id; }))];
            }
        });
    });
}
