-- Add pilot universities for MedJobs expansion
-- Run in Supabase SQL editor
-- These are priority schools for initial student onboarding

INSERT INTO public.medjobs_universities (name, slug, city, state, lat, lng) VALUES
-- Texas - Missing from initial seed
('Blinn College', 'blinn-college', 'Bryan', 'TX', 30.6744, -96.3697),

-- Michigan - New market expansion
('University of Michigan', 'umich', 'Ann Arbor', 'MI', 42.2780, -83.7382),
('Michigan State University', 'msu', 'East Lansing', 'MI', 42.7018, -84.4822)

ON CONFLICT (slug) DO NOTHING;
