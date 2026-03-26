
CREATE TABLE public.convoy_hazards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  convoy_id UUID NOT NULL REFERENCES public.convoys(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  reporter_name TEXT NOT NULL,
  reporter_color TEXT NOT NULL DEFAULT '#ef4444',
  hazard_type TEXT NOT NULL DEFAULT 'warning',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.convoy_hazards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read hazards" ON public.convoy_hazards FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can create hazards" ON public.convoy_hazards FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can delete hazards" ON public.convoy_hazards FOR DELETE TO public USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.convoy_hazards;
