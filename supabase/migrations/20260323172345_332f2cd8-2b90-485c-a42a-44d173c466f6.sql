
ALTER TABLE public.convoys
  ADD COLUMN destination_lat double precision,
  ADD COLUMN destination_lng double precision,
  ADD COLUMN destination_label text;

CREATE POLICY "Anyone can update convoys"
  ON public.convoys FOR UPDATE TO public
  USING (true)
  WITH CHECK (true);
