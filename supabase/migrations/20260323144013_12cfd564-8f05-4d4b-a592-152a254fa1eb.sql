
-- Create convoys table
CREATE TABLE public.convoys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create convoy_members table for real-time position tracking
CREATE TABLE public.convoy_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  convoy_id UUID NOT NULL REFERENCES public.convoys(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL DEFAULT 0,
  lng DOUBLE PRECISION NOT NULL DEFAULT 0,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  color TEXT NOT NULL DEFAULT '#22c55e',
  is_leader BOOLEAN NOT NULL DEFAULT false,
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (convoy_id, session_id)
);

-- Enable RLS
ALTER TABLE public.convoys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convoy_members ENABLE ROW LEVEL SECURITY;

-- Convoys: anyone can read and create
CREATE POLICY "Anyone can read convoys" ON public.convoys FOR SELECT USING (true);
CREATE POLICY "Anyone can create convoys" ON public.convoys FOR INSERT WITH CHECK (true);

-- Members: anyone can read, insert, update, delete
CREATE POLICY "Anyone can read members" ON public.convoy_members FOR SELECT USING (true);
CREATE POLICY "Anyone can join convoy" ON public.convoy_members FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update position" ON public.convoy_members FOR UPDATE USING (true);
CREATE POLICY "Anyone can leave convoy" ON public.convoy_members FOR DELETE USING (true);

-- Enable realtime for convoy_members
ALTER PUBLICATION supabase_realtime ADD TABLE public.convoy_members;

-- Indexes
CREATE INDEX idx_convoy_members_convoy_id ON public.convoy_members(convoy_id);
CREATE INDEX idx_convoys_code ON public.convoys(code);
