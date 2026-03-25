CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE POLICY "Anyone can delete convoys"
ON public.convoys
FOR DELETE
TO public
USING (true);

CREATE POLICY "Anyone can delete messages"
ON public.convoy_messages
FOR DELETE
TO public
USING (true);