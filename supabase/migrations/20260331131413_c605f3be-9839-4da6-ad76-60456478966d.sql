
-- Add distance and duration columns to convoy_trip_stats
ALTER TABLE public.convoy_trip_stats 
  ADD COLUMN distance_km double precision NOT NULL DEFAULT 0,
  ADD COLUMN duration_seconds integer NOT NULL DEFAULT 0;

-- Create table for route points (for map replay)
CREATE TABLE public.convoy_route_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  convoy_id uuid NOT NULL REFERENCES public.convoys(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  speed double precision,
  recorded_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.convoy_route_points ENABLE ROW LEVEL SECURITY;

-- Public access policies (matches existing pattern)
CREATE POLICY "Anyone can insert route points" ON public.convoy_route_points FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can read route points" ON public.convoy_route_points FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can delete route points" ON public.convoy_route_points FOR DELETE TO public USING (true);

-- Index for efficient querying
CREATE INDEX idx_convoy_route_points_convoy_session ON public.convoy_route_points(convoy_id, session_id, recorded_at);
