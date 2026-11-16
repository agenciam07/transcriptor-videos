-- =============================================================
-- Transcriptor de Videos — Endurecimiento de seguridad y robustez
-- =============================================================
-- Idempotente: se puede ejecutar más de una vez sin efectos secundarios.

-- ---------------------------------------------------------------
-- RLS: los usuarios solo LEEN y BORRAN lo suyo.
-- Crear y modificar jobs/transcripts lo hacen solo la API (service_role,
-- tras validar) y el worker (service_role). Antes la política era FOR ALL,
-- lo que permitía a un usuario cambiar source_url/status directo vía PostgREST
-- y saltarse las validaciones de la API.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "jobs_owner" ON jobs;
DROP POLICY IF EXISTS "jobs_owner_select" ON jobs;
DROP POLICY IF EXISTS "jobs_owner_delete" ON jobs;
CREATE POLICY "jobs_owner_select" ON jobs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "jobs_owner_delete" ON jobs
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "transcripts_owner" ON transcripts;
DROP POLICY IF EXISTS "transcripts_owner_select" ON transcripts;
CREATE POLICY "transcripts_owner_select" ON transcripts
  FOR SELECT USING (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- Una sola transcripción por job (el worker hace upsert por job_id)
-- ---------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_transcripts_job_id ON transcripts(job_id);

-- ---------------------------------------------------------------
-- Cola: reintento de jobs atascados (p. ej. si Railway reinicia el worker
-- a mitad de un trabajo). Máximo 3 intentos; después se marca error.
-- ---------------------------------------------------------------
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION claim_next_job()
RETURNS SETOF jobs
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE jobs
  SET    status        = 'error',
         error_message = 'El procesamiento se interrumpió varias veces. Inténtalo de nuevo.'
  WHERE  status IN ('downloading', 'converting', 'transcribing')
    AND  updated_at < now() - interval '60 minutes'
    AND  attempts >= 3;

  RETURN QUERY
  UPDATE jobs
  SET    status            = 'downloading',
         worker_claimed_at = now(),
         attempts          = attempts + 1
  WHERE  id = (
    SELECT id
    FROM   jobs
    WHERE  status = 'pending'
       OR (status IN ('downloading', 'converting', 'transcribing')
           AND updated_at < now() - interval '60 minutes'
           AND attempts < 3)
    ORDER  BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT  1
  )
  RETURNING *;
END;
$$;

-- Solo el worker (service_role) puede tomar trabajos de la cola.
REVOKE EXECUTE ON FUNCTION claim_next_job() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION claim_next_job() TO service_role;

-- ---------------------------------------------------------------
-- Realtime: la lista de trabajos escucha cambios en "jobs"
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
  END IF;
END;
$$;
