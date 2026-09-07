/** Shared action→destination mapping for email notification routing */
export function getActionRedirectUrl(
  action: string | null,
  actionId: string | null,
  slug?: string,
  emailLogId?: string | null
): string {
  // Actions that require an actionId
  if (action && actionId) {
    switch (action) {
      case "lead":
        return `/provider/connections?id=${actionId}`;
      case "message":
        return `/provider/inbox?id=${actionId}`;
      case "question":
        return `/provider/qna?id=${actionId}`;
      case "review":
        return `/provider/reviews?id=${actionId}`;
    }
  }
  // Actions that don't require an actionId
  if (action) {
    switch (action) {
      case "interview":
        return "/provider/caregivers";
      case "manage":
      case "claim":
      case "signup":
        return "/provider";
      case "notifications": {
        const query = new URLSearchParams({ tab: "notifications" });
        if (emailLogId) query.set("eid", emailLogId);
        if (slug) query.set("provider", slug);
        return `/account/settings?${query}`;
      }
      case "verify": {
        const query = new URLSearchParams({ tab: "account", verify: "1" });
        if (slug) query.set("provider", slug);
        if (emailLogId) query.set("eid", emailLogId);
        return `/account/settings?${query}`;
      }
      case "settings":
        return "/account/settings";
      case "market":
        // Cold/quiet rank email ("See where you rank") → the Growth diagnostic.
        return "/provider/growth";
      case "ads":
        // Managed-ads digest email ("We'll run the ads") → the boost pitch + setup.
        return "/provider/boost";
      case "leads":
        // Weekly lead-recap email → the Find Families connections inbox.
        return "/provider/connections";
      case "matches":
        // Find Families digest email ("a family near you") → the nearby-seeker leads view.
        return "/provider/matches";
      case "profile":
        // Onboarding profile-preview email ("how does your page look to families?")
        // → the provider's own PUBLIC page. They arrive signed in, so the owner
        // affordances show, but the page itself is the one families see.
        return slug ? `/provider/${slug}` : "/provider";
    }
  }
  return "/provider";
}

/** These destinations need no notification card after authentication. */
export function isPortalRedirectAction(action: string | null): boolean {
  return ["manage", "verify", "settings", "market", "ads", "leads", "profile", "notifications", "matches"].includes(action ?? "");
}
