/**
 * Olera - Google Ads metrics sync
 * ============================================================================
 * THIS FILE IS THE CANONICAL COPY. The running code lives inside the Google Ads
 * UI (Tools > Bulk actions > Scripts) because that is the only place it can run,
 * but the version there is a deployment, not the source. Edit here, then paste.
 *
 * WHY THAT MATTERS. A script in the Ads UI gets no code review, no types, and no
 * git history, and it runs holding an OAuth grant scoped to "see, edit, create,
 * and delete your Google Ads accounts and data" -- Google offers no read-only
 * scope, so every script carries delete rights whether it needs them or not.
 * The only real control on that is that a human reads the code before it runs.
 * Keeping the source in the repo is what makes that possible.
 *
 * WHAT IT DOES. Reads campaign totals for every campaign in the account and
 * POSTs them to Olera, which writes them onto ad_campaign_requests (provider
 * flights) and city_campaigns (Olera-owned city arms), stamped
 * metrics_source='script'. It writes nothing to Google.
 *
 * WHY IT EXISTS. Those three columns were hand-typed for the product's whole
 * life. Edmonds Villa's August flight was recorded as $0.00 / 4 impressions.
 * The real figures, returned by this script on its first run, were
 * $43.52 / 391. The numbers are about to be shown to the providers whose money
 * they describe.
 *
 * SETUP
 *   1. Paste into a new script in the Olera account (419-933-1442).
 *   2. Replace SECRET below with the value of ADS_INGEST_SECRET from Vercel.
 *   3. Authorize (one-time, per script).
 *   4. Preview once and read the log before scheduling.
 *   5. Schedule: Hourly.
 *
 * UPDATING. Editing this file changes nothing on its own -- the running copy
 * lives in the Ads UI. Paste it over the existing script and Preview once. On
 * the 2026-09-12 window change the log should show figures going UP for ended
 * flights, not down: Pacesetter's July flight from 143 back to 285. If they are
 * unchanged, the paste did not take.
 *
 * THE FIREWALL DEPENDENCY. Vercel's WAF 429s Google's script servers. The custom
 * rule `ads-metrics-ingest` on the olera-web project bypasses it for the ingest
 * path only. If this script starts failing with 429, check that rule still
 * exists before debugging anything else -- that is the failure mode, and it has
 * precedent: this firewall once blocked Google's own AdsBot sitewide.
 */

var ENDPOINT = 'https://olera.care/api/ads/metrics';

/** ADS_INGEST_SECRET from Vercel. NOT CRON_SECRET -- see the route's comment. */
var SECRET = 'REPLACE_ME';

/**
 * THE WINDOW IS THE CAMPAIGN'S WHOLE LIFE, NOT A ROLLING ONE.
 *
 * This was LAST_30_DAYS until 2026-09-12, which was wrong in a way that was
 * invisible until someone reconciled a receipt against Google by hand.
 *
 * A rolling window means a campaign's figure CHANGES EVERY DAY and decays to
 * zero about thirty days after it stops serving. Four ended flights had already
 * reached zero that way -- Franchil, Abode, Miracle-Lightstar and Impact --
 * while Miracle-Lightstar had really run 338 impressions. Pacesetter's July
 * flight had halved, from a real 285 down to 143, and would have told that
 * provider their $51.82 bought half what it did. These numbers are stamped
 * metrics_source='script', which the provider-facing gate trusts, so a decayed
 * figure is shown to the provider as fact.
 *
 * ALL_TIME is right because THE CAMPAIGN IS THE FLIGHT. One Google campaign is
 * built per flight -- see the names: "LumiWell Home Care - Fresno - Aug 2026"
 * -- so a campaign's lifetime total IS what that flight bought, and it stops
 * moving once the flight ends. That is also what the receipt claims the number
 * means ("Times your ad was shown"), and what /ad-boost-audit has always told a
 * human to do: "Set the date range to All time once... The default 30-day
 * window renders ended campaigns as zeros and looks like 'no data.'" That
 * failure was diagnosed in the manual workflow before this script ever shipped.
 *
 * THE ONE EXCEPTION is a Google campaign that backs TWO Olera flights, where
 * no single window can be right for either. HomeWell Oak Ridge is the known
 * case: one campaign, a July flight and an August one. Those are entered by
 * hand as metrics_source='verified', and the server refuses to let this script
 * overwrite them. Do not try to solve that case here -- splitting a campaign's
 * total across flight windows needs the flight dates, which live in Olera and
 * not in Google.
 *
 * Google reports against the account time zone, which is Central for this one.
 */
var WINDOW = 'ALL_TIME';

function main() {
  var campaigns = [];

  // AdsApp.campaigns() covers Search and Display. It does NOT include
  // Performance Max or video campaigns -- if either is ever launched, its spend
  // will silently be absent here rather than wrong, and this comment is the
  // only warning you will get.
  var it = AdsApp.campaigns().get();
  while (it.hasNext()) {
    var c = it.next();
    var s = c.getStatsFor(WINDOW);
    campaigns.push({
      id: String(c.getId()),
      name: c.getName(),
      impressions: s.getImpressions(),
      clicks: s.getClicks(),
      // A float in account currency. Fractional cents are normal: costs are
      // micros underneath, so 53.454411 is a real value, not a bug. The server
      // rounds to cents.
      cost: s.getCost()
    });
  }

  if (campaigns.length === 0) {
    // Posting an empty array would be indistinguishable from a healthy run with
    // nothing to say, so refuse instead. An account with no campaigns at all is
    // a broken selector, not a quiet day.
    throw new Error('No campaigns returned. Refusing to post an empty payload.');
  }

  var resp = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + SECRET },
    payload: JSON.stringify({ campaigns: campaigns }),
    muteHttpExceptions: true
  });

  var code = resp.getResponseCode();
  var text = String(resp.getContentText()).substring(0, 800);
  Logger.log('Posted ' + campaigns.length + ' campaigns -> HTTP ' + code);
  Logger.log(text);

  // THROW ON FAILURE, ON PURPOSE. A script that swallows its own errors goes
  // quiet and the dashboard keeps showing last week's numbers as if they were
  // current -- which is the exact class of silent failure this whole change
  // exists to end. Throwing marks the run failed in the Ads UI and triggers
  // Google's failure email. Staleness should be loud.
  if (code !== 200) {
    throw new Error('Metrics ingest failed with HTTP ' + code + ': ' + text);
  }

  // Unmatched campaigns are not an error -- they are campaigns whose
  // platform_campaign_id has not been backfilled yet. Surface them so the gap is
  // visible in the run log rather than being quietly dropped on the server.
  try {
    var parsed = JSON.parse(resp.getContentText());
    if (parsed && parsed.unmatched && parsed.unmatched.length) {
      Logger.log('UNMATCHED (needs platform_campaign_id backfill): ' +
        parsed.unmatched.map(function (u) { return u.id + ' ' + (u.name || ''); }).join(' | '));
    }
    if (parsed && parsed.rejected && parsed.rejected.length) {
      Logger.log('REJECTED: ' + JSON.stringify(parsed.rejected));
    }
    // Not a gap and not an error: a human entered these off the ad platform for
    // a specific flight window, and the server is protecting them from this
    // script. Logged so a run that "updated fewer than expected" explains
    // itself instead of looking like a mapping problem.
    if (parsed && parsed.skippedVerified && parsed.skippedVerified.length) {
      Logger.log('HELD (verified by hand, not overwritten): ' +
        parsed.skippedVerified.join(' | '));
    }
  } catch (e) {
    Logger.log('Could not parse response body: ' + e);
  }
}
