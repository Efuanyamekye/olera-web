import type { ManagedAdsVariant } from "./managed-ads-variant";

export function managedAdsVariantLabel(variant: ManagedAdsVariant): string {
  switch (variant) {
    case "direct_reach":
      return "Direct reach";
    case "local_plan":
      return "Local plan";
  }
}

export function managedAdsVariantSubLabel(variant: ManagedAdsVariant): string {
  switch (variant) {
    case "direct_reach":
      return "Reach families already searching";
    case "local_plan":
      return "Ads we run, families to your page";
  }
}

export type ManagedAdsPitchCopy = {
  headline: string;
  accent: string;
  body: string;
};

export function managedAdsPitchCopy(variant: ManagedAdsVariant): ManagedAdsPitchCopy {
  switch (variant) {
    case "local_plan":
      return {
        headline: "Reach families",
        accent: "already searching for care",
        body: "We run the ads, point them at the families most likely to choose you, and send every one straight to your page.",
      };
    case "direct_reach":
      return {
        headline: "Reach families",
        accent: "already searching for care",
        body: "We run the ads, point them at the families most likely to choose you, and send every one straight to your page.",
      };
  }
}
