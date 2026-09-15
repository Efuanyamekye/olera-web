"use strict";
/**
 * City Broadcasts - Core Processing Logic
 *
 * Handles detection of new events (questions, published profiles) and
 * processing them into broadcast emails to eligible providers.
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
exports.CITY_BROADCAST_PROFILE_TYPE = exports.CITY_BROADCAST_QUESTION_TYPE = void 0;
exports.detectNewEvents = detectNewEvents;
exports.createBroadcastEvent = createBroadcastEvent;
exports.processEvent = processEvent;
exports.processNewPoolMembers = processNewPoolMembers;
exports.sendBroadcastEmail = sendBroadcastEmail;
exports.processPendingEvents = processPendingEvents;
var admin_1 = require("@/lib/admin");
var email_1 = require("@/lib/email");
var eligibility_1 = require("./eligibility");
var templates_1 = require("./templates");
/** Email types for city broadcasts (registered in email governance) */
exports.CITY_BROADCAST_QUESTION_TYPE = "city_broadcast_question";
exports.CITY_BROADCAST_PROFILE_TYPE = "city_broadcast_profile";
/** Max events to process per cron run */
var BATCH_SIZE = 50;
/** Max providers to notify per event */
var MAX_PROVIDERS_PER_EVENT = 20;
/**
 * Detect new events that should trigger city broadcasts.
 * Looks for questions and published profiles from the last hour
 * that haven't been processed yet.
 */
function detectNewEvents() {
    return __awaiter(this, void 0, void 0, function () {
        var db, events, oneHourAgo, _a, questions, qErr, questionIds, existing, existingIds_1, newQuestions, providerIds, providers, providerMap, _i, newQuestions_1, q, provider, _b, seekerActivity, pErr, activityIds, existing, existingIds_2, newActivity, profileIds, profiles, profileMap, _c, newActivity_1, activity, profile;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    db = (0, admin_1.getServiceClient)();
                    events = [];
                    oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
                    return [4 /*yield*/, db
                            .from("provider_questions")
                            .select("id, question, provider_id")
                            .gte("created_at", oneHourAgo)
                            .eq("status", "pending")
                            .is("canonical_question_id", null)
                            .limit(BATCH_SIZE)];
                case 1:
                    _a = _d.sent(), questions = _a.data, qErr = _a.error;
                    if (!qErr) return [3 /*break*/, 2];
                    console.error("[city-broadcasts] Failed to fetch questions:", qErr);
                    return [3 /*break*/, 5];
                case 2:
                    if (!(questions && questions.length > 0)) return [3 /*break*/, 5];
                    questionIds = questions.map(function (q) { return q.id; });
                    return [4 /*yield*/, db
                            .from("city_broadcast_events")
                            .select("event_id")
                            .eq("event_type", "question_asked")
                            .in("event_id", questionIds)];
                case 3:
                    existing = (_d.sent()).data;
                    existingIds_1 = new Set((existing || []).map(function (e) { return e.event_id; }));
                    newQuestions = questions.filter(function (q) { return !existingIds_1.has(q.id); });
                    if (!(newQuestions.length > 0)) return [3 /*break*/, 5];
                    providerIds = newQuestions.map(function (q) { return q.provider_id; });
                    return [4 /*yield*/, db
                            .from("olera-providers")
                            .select("provider_id, city, state, provider_category")
                            .in("provider_id", providerIds)];
                case 4:
                    providers = (_d.sent()).data;
                    providerMap = new Map((providers || []).map(function (p) { return [p.provider_id, p]; }));
                    for (_i = 0, newQuestions_1 = newQuestions; _i < newQuestions_1.length; _i++) {
                        q = newQuestions_1[_i];
                        provider = providerMap.get(q.provider_id);
                        if (!(provider === null || provider === void 0 ? void 0 : provider.city))
                            continue;
                        events.push({
                            eventType: "question_asked",
                            eventId: q.id,
                            city: provider.city,
                            state: provider.state || null,
                            category: provider.provider_category || null,
                            questionText: q.question,
                        });
                    }
                    _d.label = 5;
                case 5: return [4 /*yield*/, db
                        .from("seeker_activity")
                        .select("id, profile_id, metadata")
                        .eq("event_type", "profile_published")
                        .gte("created_at", oneHourAgo)
                        .limit(BATCH_SIZE)];
                case 6:
                    _b = _d.sent(), seekerActivity = _b.data, pErr = _b.error;
                    if (!pErr) return [3 /*break*/, 7];
                    console.error("[city-broadcasts] Failed to fetch profiles:", pErr);
                    return [3 /*break*/, 10];
                case 7:
                    if (!(seekerActivity && seekerActivity.length > 0)) return [3 /*break*/, 10];
                    activityIds = seekerActivity.map(function (p) { return p.id; });
                    return [4 /*yield*/, db
                            .from("city_broadcast_events")
                            .select("event_id")
                            .eq("event_type", "profile_published")
                            .in("event_id", activityIds)];
                case 8:
                    existing = (_d.sent()).data;
                    existingIds_2 = new Set((existing || []).map(function (e) { return e.event_id; }));
                    newActivity = seekerActivity.filter(function (a) { return !existingIds_2.has(a.id); });
                    if (!(newActivity.length > 0)) return [3 /*break*/, 10];
                    profileIds = newActivity.map(function (a) { return a.profile_id; });
                    return [4 /*yield*/, db
                            .from("business_profiles")
                            .select("id, city, state")
                            .in("id", profileIds)];
                case 9:
                    profiles = (_d.sent()).data;
                    profileMap = new Map((profiles || []).map(function (p) { return [p.id, p]; }));
                    for (_c = 0, newActivity_1 = newActivity; _c < newActivity_1.length; _c++) {
                        activity = newActivity_1[_c];
                        profile = profileMap.get(activity.profile_id);
                        if (!(profile === null || profile === void 0 ? void 0 : profile.city))
                            continue;
                        events.push({
                            eventType: "profile_published",
                            eventId: activity.id,
                            city: profile.city,
                            state: profile.state || null,
                            category: null, // Profile broadcasts don't filter by category
                        });
                    }
                    _d.label = 10;
                case 10: return [2 /*return*/, events];
            }
        });
    });
}
/**
 * Create a broadcast event record for tracking.
 */
function createBroadcastEvent(event) {
    return __awaiter(this, void 0, void 0, function () {
        var db, _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    db = (0, admin_1.getServiceClient)();
                    return [4 /*yield*/, db
                            .from("city_broadcast_events")
                            .insert({
                            event_type: event.eventType,
                            event_id: event.eventId,
                            city: event.city,
                            state: event.state,
                            category: event.category,
                            status: "pending",
                        })
                            .select("id")
                            .single()];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error) {
                        console.error("[city-broadcasts] Failed to create event:", error);
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, data.id];
            }
        });
    });
}
/**
 * Process a single broadcast event: find eligible providers and send emails.
 */
function processEvent(broadcastEventId, event) {
    return __awaiter(this, void 0, void 0, function () {
        var db, sent, skipped, _a, eligible, excluded, totalExcluded, recipientRows, _i, eligible_1, provider, result;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    db = (0, admin_1.getServiceClient)();
                    sent = 0;
                    skipped = 0;
                    // Mark as processing
                    return [4 /*yield*/, db
                            .from("city_broadcast_events")
                            .update({ status: "processing" })
                            .eq("id", broadcastEventId)];
                case 1:
                    // Mark as processing
                    _b.sent();
                    return [4 /*yield*/, (0, eligibility_1.findEligibleProviders)(event.city, event.category, MAX_PROVIDERS_PER_EVENT)];
                case 2:
                    _a = _b.sent(), eligible = _a.eligible, excluded = _a.excluded;
                    totalExcluded = Object.values(excluded).reduce(function (a, b) { return a + b; }, 0);
                    if (!(eligible.length === 0)) return [3 /*break*/, 4];
                    // No eligible providers - mark as skipped
                    return [4 /*yield*/, db
                            .from("city_broadcast_events")
                            .update({
                            status: "skipped",
                            skip_reason: "No eligible providers (".concat(totalExcluded, " excluded)"),
                            providers_eligible: 0,
                            providers_sent: 0,
                            processed_at: new Date().toISOString(),
                        })
                            .eq("id", broadcastEventId)];
                case 3:
                    // No eligible providers - mark as skipped
                    _b.sent();
                    return [2 /*return*/, { sent: 0, skipped: 0 }];
                case 4:
                    recipientRows = eligible.map(function (p) { return ({
                        event_id: broadcastEventId,
                        provider_id: p.provider_id,
                        provider_email: p.email,
                        provider_name: p.name,
                        status: "pending",
                    }); });
                    return [4 /*yield*/, db.from("city_broadcast_recipients").insert(recipientRows)];
                case 5:
                    _b.sent();
                    _i = 0, eligible_1 = eligible;
                    _b.label = 6;
                case 6:
                    if (!(_i < eligible_1.length)) return [3 /*break*/, 9];
                    provider = eligible_1[_i];
                    return [4 /*yield*/, sendBroadcastEmail(broadcastEventId, event, provider)];
                case 7:
                    result = _b.sent();
                    if (result.sent) {
                        sent++;
                    }
                    else {
                        skipped++;
                    }
                    _b.label = 8;
                case 8:
                    _i++;
                    return [3 /*break*/, 6];
                case 9: 
                // Mark event as completed
                return [4 /*yield*/, db
                        .from("city_broadcast_events")
                        .update({
                        status: "completed",
                        providers_eligible: eligible.length,
                        providers_sent: sent,
                        processed_at: new Date().toISOString(),
                    })
                        .eq("id", broadcastEventId)];
                case 10:
                    // Mark event as completed
                    _b.sent();
                    return [2 /*return*/, { sent: sent, skipped: skipped }];
            }
        });
    });
}
/** How far back to look for existing family activity to send to new pool members (30 days) */
var EXISTING_ACTIVITY_LOOKBACK_DAYS = 30;
/**
 * Find providers in the broadcast_ready pool who haven't received any
 * broadcasts yet. These providers should receive a "welcome" broadcast
 * about existing family activity in their city.
 *
 * Previously this was limited to providers who entered in the last 24 hours,
 * but that caused issues when providers were added to the pool by teammates
 * in different timezones or when no family activity occurred within that window.
 * Now we check ALL broadcast_ready providers who haven't received a broadcast.
 */
function findNewPoolMembers() {
    return __awaiter(this, void 0, void 0, function () {
        var db, _a, poolMembers, trackingError, providerIds, alreadyProcessed, alreadyProcessedIds, providers, categoryMap;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    db = (0, admin_1.getServiceClient)();
                    return [4 /*yield*/, db
                            .from("provider_outreach_tracking")
                            .select("provider_id, city, state")
                            .eq("stage", "broadcast_ready")
                            .limit(BATCH_SIZE)];
                case 1:
                    _a = _b.sent(), poolMembers = _a.data, trackingError = _a.error;
                    if (trackingError) {
                        console.error("[city-broadcasts] Failed to fetch pool members:", trackingError);
                        return [2 /*return*/, []];
                    }
                    if (!poolMembers || poolMembers.length === 0) {
                        return [2 /*return*/, []];
                    }
                    providerIds = poolMembers.map(function (r) { return r.provider_id; });
                    return [4 /*yield*/, db
                            .from("city_broadcast_recipients")
                            .select("provider_id")
                            .in("provider_id", providerIds)];
                case 2:
                    alreadyProcessed = (_b.sent()).data;
                    alreadyProcessedIds = new Set((alreadyProcessed || []).map(function (r) { return r.provider_id; }));
                    return [4 /*yield*/, db
                            .from("olera-providers")
                            .select("provider_id, provider_category")
                            .in("provider_id", providerIds)
                            .or("deleted.is.null,deleted.eq.false")];
                case 3:
                    providers = (_b.sent()).data;
                    categoryMap = new Map((providers || []).map(function (p) { return [p.provider_id, p.provider_category]; }));
                    return [2 /*return*/, poolMembers
                            .filter(function (r) { return !alreadyProcessedIds.has(r.provider_id); })
                            .filter(function (r) { return r.city; }) // Must have a city
                            .map(function (r) { return ({
                            providerId: r.provider_id,
                            city: r.city,
                            state: r.state || null,
                            category: categoryMap.get(r.provider_id) || null,
                        }); })];
            }
        });
    });
}
/**
 * Find existing family activity in a city that can be used for new pool member broadcasts.
 * Looks for recent published profiles or questions in the city.
 *
 * @param city - City name to search in
 * @param state - State to filter by (important for disambiguation - e.g., Springfield exists in many states)
 * @param category - Provider category (optional, used for question attribution)
 */
function findExistingActivityForCity(city, state, category) {
    return __awaiter(this, void 0, void 0, function () {
        var db, cutoff, profileQuery, profiles, profile, activity, providerQuery, providers, providerIds, questionQuery, questions, q;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = (0, admin_1.getServiceClient)();
                    cutoff = new Date(Date.now() - EXISTING_ACTIVITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
                    profileQuery = db
                        .from("business_profiles")
                        .select("id, city, state")
                        .ilike("city", city)
                        .gte("created_at", cutoff)
                        .not("account_id", "is", null) // Has an actual seeker
                        .order("created_at", { ascending: false })
                        .limit(1);
                    // Filter by state if provided (important for city disambiguation)
                    if (state) {
                        profileQuery = profileQuery.ilike("state", state);
                    }
                    return [4 /*yield*/, profileQuery];
                case 1:
                    profiles = (_a.sent()).data;
                    if (!(profiles && profiles.length > 0)) return [3 /*break*/, 3];
                    profile = profiles[0];
                    return [4 /*yield*/, db
                            .from("seeker_activity")
                            .select("id")
                            .eq("profile_id", profile.id)
                            .eq("event_type", "profile_published")
                            .limit(1)];
                case 2:
                    activity = (_a.sent()).data;
                    if (activity && activity.length > 0) {
                        return [2 /*return*/, {
                                eventType: "profile_published",
                                eventId: activity[0].id,
                                city: profile.city,
                                state: profile.state || null,
                                category: null,
                            }];
                    }
                    _a.label = 3;
                case 3:
                    providerQuery = db
                        .from("olera-providers")
                        .select("provider_id")
                        .ilike("city", city)
                        .or("deleted.is.null,deleted.eq.false");
                    // Filter by state if provided (important for city disambiguation)
                    if (state) {
                        providerQuery = providerQuery.ilike("state", state);
                    }
                    return [4 /*yield*/, providerQuery];
                case 4:
                    providers = (_a.sent()).data;
                    if (!(providers && providers.length > 0)) return [3 /*break*/, 6];
                    providerIds = providers.map(function (p) { return p.provider_id; });
                    questionQuery = db
                        .from("provider_questions")
                        .select("id, question, provider_id")
                        .in("provider_id", providerIds)
                        .gte("created_at", cutoff)
                        .order("created_at", { ascending: false })
                        .limit(1);
                    return [4 /*yield*/, questionQuery];
                case 5:
                    questions = (_a.sent()).data;
                    if (questions && questions.length > 0) {
                        q = questions[0];
                        return [2 /*return*/, {
                                eventType: "question_asked",
                                eventId: q.id,
                                city: city,
                                state: state,
                                category: category,
                                questionText: q.question,
                            }];
                    }
                    _a.label = 6;
                case 6: return [2 /*return*/, null];
            }
        });
    });
}
/**
 * Process new pool members by sending them broadcasts about existing family activity.
 */
function processNewPoolMembers(maxRuntimeMs, startedAt) {
    return __awaiter(this, void 0, void 0, function () {
        var db, found, sent, skipped, newMembers, membersByCity, _i, newMembers_1, member, key, _a, membersByCity_1, _b, cityKey, members, firstMember, activity, existingEvent, broadcastEventId, id, _c, members_1, member, providerDetails, tracking, apolloContact, email, badEmail, provider, existingRecipient, result;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    db = (0, admin_1.getServiceClient)();
                    found = 0;
                    sent = 0;
                    skipped = 0;
                    return [4 /*yield*/, findNewPoolMembers()];
                case 1:
                    newMembers = _d.sent();
                    found = newMembers.length;
                    if (found === 0) {
                        return [2 /*return*/, { found: found, sent: sent, skipped: skipped }];
                    }
                    console.log("[city-broadcasts] Found ".concat(found, " new pool members to process"));
                    membersByCity = new Map();
                    for (_i = 0, newMembers_1 = newMembers; _i < newMembers_1.length; _i++) {
                        member = newMembers_1[_i];
                        key = member.city.toLowerCase();
                        if (!membersByCity.has(key)) {
                            membersByCity.set(key, []);
                        }
                        membersByCity.get(key).push(member);
                    }
                    _a = 0, membersByCity_1 = membersByCity;
                    _d.label = 2;
                case 2:
                    if (!(_a < membersByCity_1.length)) return [3 /*break*/, 17];
                    _b = membersByCity_1[_a], cityKey = _b[0], members = _b[1];
                    if (Date.now() - startedAt > maxRuntimeMs) {
                        skipped += members.length;
                        return [3 /*break*/, 16];
                    }
                    firstMember = members[0];
                    return [4 /*yield*/, findExistingActivityForCity(firstMember.city, firstMember.state, firstMember.category)];
                case 3:
                    activity = _d.sent();
                    if (!activity) {
                        // No existing activity in this city - skip these members
                        console.log("[city-broadcasts] No existing activity in ".concat(firstMember.city, ", skipping ").concat(members.length, " new members"));
                        skipped += members.length;
                        return [3 /*break*/, 16];
                    }
                    return [4 /*yield*/, db
                            .from("city_broadcast_events")
                            .select("id")
                            .eq("event_id", activity.eventId)
                            .eq("event_type", activity.eventType)
                            .limit(1)];
                case 4:
                    existingEvent = (_d.sent()).data;
                    broadcastEventId = void 0;
                    if (!(existingEvent && existingEvent.length > 0)) return [3 /*break*/, 5];
                    broadcastEventId = existingEvent[0].id;
                    return [3 /*break*/, 7];
                case 5: return [4 /*yield*/, createBroadcastEvent(activity)];
                case 6:
                    id = _d.sent();
                    if (!id) {
                        skipped += members.length;
                        return [3 /*break*/, 16];
                    }
                    broadcastEventId = id;
                    _d.label = 7;
                case 7:
                    _c = 0, members_1 = members;
                    _d.label = 8;
                case 8:
                    if (!(_c < members_1.length)) return [3 /*break*/, 16];
                    member = members_1[_c];
                    if (Date.now() - startedAt > maxRuntimeMs) {
                        skipped++;
                        return [3 /*break*/, 15];
                    }
                    return [4 /*yield*/, db
                            .from("olera-providers")
                            .select("provider_id, provider_name, slug, email")
                            .eq("provider_id", member.providerId)
                            .or("deleted.is.null,deleted.eq.false")
                            .single()];
                case 9:
                    providerDetails = (_d.sent()).data;
                    if (!providerDetails) {
                        skipped++;
                        return [3 /*break*/, 15];
                    }
                    return [4 /*yield*/, db
                            .from("provider_outreach_tracking")
                            .select("apollo_contact")
                            .eq("provider_id", member.providerId)
                            .single()];
                case 10:
                    tracking = (_d.sent()).data;
                    apolloContact = tracking === null || tracking === void 0 ? void 0 : tracking.apollo_contact;
                    email = (apolloContact === null || apolloContact === void 0 ? void 0 : apolloContact.email) || providerDetails.email;
                    if (!email) {
                        skipped++;
                        return [3 /*break*/, 15];
                    }
                    return [4 /*yield*/, db
                            .from("email_log")
                            .select("id")
                            .eq("recipient", email.toLowerCase())
                            .or("bounced_at.not.is.null,complained_at.not.is.null")
                            .limit(1)];
                case 11:
                    badEmail = (_d.sent()).data;
                    if (badEmail && badEmail.length > 0) {
                        skipped++;
                        return [3 /*break*/, 15];
                    }
                    provider = {
                        provider_id: member.providerId,
                        name: providerDetails.provider_name || "Provider",
                        slug: providerDetails.slug || "",
                        email: email,
                        city: member.city,
                        state: member.state,
                        category: member.category,
                    };
                    return [4 /*yield*/, db
                            .from("city_broadcast_recipients")
                            .select("id")
                            .eq("event_id", broadcastEventId)
                            .eq("provider_id", member.providerId)
                            .limit(1)];
                case 12:
                    existingRecipient = (_d.sent()).data;
                    if (existingRecipient && existingRecipient.length > 0) {
                        // Already processed for this event, skip
                        skipped++;
                        return [3 /*break*/, 15];
                    }
                    // Create recipient record
                    return [4 /*yield*/, db.from("city_broadcast_recipients").insert({
                            event_id: broadcastEventId,
                            provider_id: member.providerId,
                            provider_email: email,
                            provider_name: provider.name,
                            status: "pending",
                        })];
                case 13:
                    // Create recipient record
                    _d.sent();
                    return [4 /*yield*/, sendBroadcastEmail(broadcastEventId, activity, provider, true)];
                case 14:
                    result = _d.sent();
                    if (result.sent) {
                        sent++;
                        console.log("[city-broadcasts] Sent new pool member broadcast to ".concat(provider.name, " in ").concat(member.city));
                    }
                    else {
                        skipped++;
                    }
                    _d.label = 15;
                case 15:
                    _c++;
                    return [3 /*break*/, 8];
                case 16:
                    _a++;
                    return [3 /*break*/, 2];
                case 17: return [2 /*return*/, { found: found, sent: sent, skipped: skipped }];
            }
        });
    });
}
/**
 * Send a broadcast email to a single provider.
 * Exported for use by new pool member processing.
 *
 * @param isNewPoolMember - True if this is a new pool member broadcast (default: false)
 */
function sendBroadcastEmail(broadcastEventId_1, event_1, provider_1) {
    return __awaiter(this, arguments, void 0, function (broadcastEventId, event, provider, isNewPoolMember) {
        var db, ctx, emailType, rendered, result;
        if (isNewPoolMember === void 0) { isNewPoolMember = false; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = (0, admin_1.getServiceClient)();
                    ctx = {
                        providerId: provider.provider_id,
                        providerName: provider.name,
                        providerSlug: provider.slug,
                        providerEmail: provider.email,
                        city: event.city,
                        category: event.category,
                        questionText: event.questionText,
                    };
                    emailType = event.eventType === "question_asked"
                        ? exports.CITY_BROADCAST_QUESTION_TYPE
                        : exports.CITY_BROADCAST_PROFILE_TYPE;
                    rendered = event.eventType === "question_asked"
                        ? (0, templates_1.renderQuestionBroadcast)(ctx)
                        : (0, templates_1.renderProfileBroadcast)(ctx);
                    return [4 /*yield*/, (0, email_1.sendEmail)({
                            to: provider.email,
                            subject: rendered.subject,
                            html: rendered.html,
                            emailType: emailType,
                            recipientType: "provider",
                            providerId: provider.provider_id,
                            metadata: {
                                broadcast_event_id: broadcastEventId,
                                event_type: event.eventType,
                                city: event.city,
                                category: event.category,
                                new_pool_member: isNewPoolMember,
                            },
                        })];
                case 1:
                    result = _a.sent();
                    if (!(result.success && !result.skipped)) return [3 /*break*/, 3];
                    return [4 /*yield*/, db
                            .from("city_broadcast_recipients")
                            .update({
                            status: "sent",
                            email_log_id: result.emailLogId || null,
                        })
                            .eq("event_id", broadcastEventId)
                            .eq("provider_id", provider.provider_id)];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { sent: true }];
                case 3: return [4 /*yield*/, db
                        .from("city_broadcast_recipients")
                        .update({
                        status: result.skipped ? "skipped" : "failed",
                        skip_reason: result.skipReason || result.error || "Unknown error",
                        email_log_id: result.emailLogId || null,
                    })
                        .eq("event_id", broadcastEventId)
                        .eq("provider_id", provider.provider_id)];
                case 4:
                    _a.sent();
                    return [2 /*return*/, { sent: false, error: result.skipReason || result.error }];
            }
        });
    });
}
/**
 * Process pending broadcast events.
 * Called by the cron job with a timeout guard.
 */
function processPendingEvents(maxRuntimeMs) {
    return __awaiter(this, void 0, void 0, function () {
        var db, startedAt, result, orphanedEvents, _i, _a, orphan, questionText, question, event_1, _b, sent, skipped, newEvents, eventRecords, _c, newEvents_1, event_2, id, _d, eventRecords_1, record, _e, sent, skipped, poolMemberResult;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    db = (0, admin_1.getServiceClient)();
                    startedAt = Date.now();
                    result = {
                        eventsDetected: 0,
                        eventsProcessed: 0,
                        eventsSkipped: 0,
                        providersSent: 0,
                        providersSkipped: 0,
                        newPoolMembersFound: 0,
                        newPoolMembersSent: 0,
                        newPoolMembersSkipped: 0,
                    };
                    return [4 /*yield*/, db
                            .from("city_broadcast_events")
                            .select("id, event_type, event_id, city, state, category")
                            .in("status", ["pending", "processing"])
                            .order("created_at", { ascending: true })
                            .limit(BATCH_SIZE)];
                case 1:
                    orphanedEvents = (_f.sent()).data;
                    _i = 0, _a = orphanedEvents || [];
                    _f.label = 2;
                case 2:
                    if (!(_i < _a.length)) return [3 /*break*/, 7];
                    orphan = _a[_i];
                    if (Date.now() - startedAt > maxRuntimeMs) {
                        result.eventsSkipped++;
                        return [3 /*break*/, 6];
                    }
                    questionText = void 0;
                    if (!(orphan.event_type === "question_asked")) return [3 /*break*/, 4];
                    return [4 /*yield*/, db
                            .from("provider_questions")
                            .select("question")
                            .eq("id", orphan.event_id)
                            .single()];
                case 3:
                    question = (_f.sent()).data;
                    questionText = question === null || question === void 0 ? void 0 : question.question;
                    _f.label = 4;
                case 4:
                    event_1 = {
                        eventType: orphan.event_type,
                        eventId: orphan.event_id,
                        city: orphan.city,
                        state: orphan.state,
                        category: orphan.category,
                        questionText: questionText,
                    };
                    return [4 /*yield*/, processEvent(orphan.id, event_1)];
                case 5:
                    _b = _f.sent(), sent = _b.sent, skipped = _b.skipped;
                    result.eventsProcessed++;
                    result.providersSent += sent;
                    result.providersSkipped += skipped;
                    _f.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 2];
                case 7: return [4 /*yield*/, detectNewEvents()];
                case 8:
                    newEvents = _f.sent();
                    result.eventsDetected = newEvents.length;
                    eventRecords = [];
                    _c = 0, newEvents_1 = newEvents;
                    _f.label = 9;
                case 9:
                    if (!(_c < newEvents_1.length)) return [3 /*break*/, 12];
                    event_2 = newEvents_1[_c];
                    if (Date.now() - startedAt > maxRuntimeMs)
                        return [3 /*break*/, 12];
                    return [4 /*yield*/, createBroadcastEvent(event_2)];
                case 10:
                    id = _f.sent();
                    if (id) {
                        eventRecords.push({ id: id, event: event_2 });
                    }
                    _f.label = 11;
                case 11:
                    _c++;
                    return [3 /*break*/, 9];
                case 12:
                    _d = 0, eventRecords_1 = eventRecords;
                    _f.label = 13;
                case 13:
                    if (!(_d < eventRecords_1.length)) return [3 /*break*/, 16];
                    record = eventRecords_1[_d];
                    if (Date.now() - startedAt > maxRuntimeMs) {
                        result.eventsSkipped++;
                        return [3 /*break*/, 15];
                    }
                    return [4 /*yield*/, processEvent(record.id, record.event)];
                case 14:
                    _e = _f.sent(), sent = _e.sent, skipped = _e.skipped;
                    result.eventsProcessed++;
                    result.providersSent += sent;
                    result.providersSkipped += skipped;
                    _f.label = 15;
                case 15:
                    _d++;
                    return [3 /*break*/, 13];
                case 16:
                    if (!(Date.now() - startedAt < maxRuntimeMs)) return [3 /*break*/, 18];
                    return [4 /*yield*/, processNewPoolMembers(maxRuntimeMs, startedAt)];
                case 17:
                    poolMemberResult = _f.sent();
                    result.newPoolMembersFound = poolMemberResult.found;
                    result.newPoolMembersSent = poolMemberResult.sent;
                    result.newPoolMembersSkipped = poolMemberResult.skipped;
                    _f.label = 18;
                case 18: return [2 /*return*/, result];
            }
        });
    });
}
