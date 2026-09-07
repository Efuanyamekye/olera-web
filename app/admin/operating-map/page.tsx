import type { Metadata } from "next";
import { Suspense } from "react";
import OperatingMapView from "@/components/admin/operating-map/OperatingMapView";

export const metadata: Metadata = {
  title: "Operating Map",
};

export default function AdminOperatingMapPage() {
  return (
    <div>
      {/* The heading lives in the view, on the same row as the date range,
          so it costs one row of chrome instead of two. */}
      {/* useSearchParams needs a Suspense boundary to prerender. */}
      <Suspense fallback={null}>
        <OperatingMapView />
      </Suspense>
    </div>
  );
}
