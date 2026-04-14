-- Migration: Create olera_reviews table for guest reviews (from review request flow)
-- These are reviews submitted via the review link when provider has no Google Place ID
-- Unlike the main "reviews" table, these don't require authentication

CREATE TABLE IF NOT EXISTS olera_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_slug TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT NOT NULL CHECK (char_length(review_text) >= 10),
  flagged BOOLEAN NOT NULL DEFAULT false,
  flagged_at TIMESTAMPTZ,
  flagged_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_olera_reviews_provider ON olera_reviews(provider_slug);
CREATE INDEX idx_olera_reviews_created ON olera_reviews(created_at DESC);
CREATE INDEX idx_olera_reviews_flagged ON olera_reviews(flagged) WHERE flagged = true;

-- RLS
ALTER TABLE olera_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can read non-flagged reviews
CREATE POLICY "Public can read non-flagged olera reviews"
  ON olera_reviews FOR SELECT
  USING (flagged = false);

-- Anyone can insert reviews (no auth required for guest reviews)
CREATE POLICY "Anyone can insert olera reviews"
  ON olera_reviews FOR INSERT
  WITH CHECK (true);

-- Only service role can update (for flagging)
-- Note: This is handled by service client, no user-facing policy needed
