
CREATE TABLE public.convoy_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  convoy_id uuid NOT NULL REFERENCES public.convoys(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  sender_name text NOT NULL,
  sender_color text NOT NULL DEFAULT '#22c55e',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.convoy_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read messages" ON public.convoy_messages FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can send messages" ON public.convoy_messages FOR INSERT TO public WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.convoy_messages;
