
CREATE TABLE public.convoy_trip_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  convoy_id uuid NOT NULL REFERENCES public.convoys(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  driver_name text NOT NULL,
  driver_color text NOT NULL DEFAULT '#22c55e',
  top_speed double precision NOT NULL DEFAULT 0,
  avg_speed double precision NOT NULL DEFAULT 0,
  fastest_acceleration double precision NOT NULL DEFAULT 0,
  hardest_brake double precision NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (convoy_id, session_id)
);

ALTER TABLE public.convoy_trip_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read trip stats" ON public.convoy_trip_stats FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert trip stats" ON public.convoy_trip_stats FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update trip stats" ON public.convoy_trip_stats FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete trip stats" ON public.convoy_trip_stats FOR DELETE TO public USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.convoy_trip_stats;
