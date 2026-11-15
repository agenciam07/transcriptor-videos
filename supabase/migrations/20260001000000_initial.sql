-- =============================================================
-- Transcriptor de Videos — Migración inicial
-- =============================================================

-- ---------------------------------------------------------------
-- Tabla: jobs (cola de trabajos de transcripción)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type       text        NOT NULL CHECK (source_type IN ('link', 'upload')),
  source_url        text        NOT NULL,
  status            text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','downloading','converting','transcribing','done','error')),
  error_message     text,
  language          text,
  worker_claimed_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Índice para el worker (cola de pendientes ordenada por llegada)
CREATE INDEX IF NOT EXISTS idx_jobs_status_created
  ON jobs(status, created_at)
  WHERE status = 'pending';

-- Índice para listado por usuario
CREATE INDEX IF NOT EXISTS idx_jobs_user_created
  ON jobs(user_id, created_at DESC);

-- ---------------------------------------------------------------
-- Tabla: transcripts (resultados de transcripción)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transcripts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            uuid        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text_plain        text        NOT NULL,
  text_srt          text        NOT NULL,
  text_md           text        NOT NULL,
  detected_language text,
  duration_seconds  integer,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transcripts_user
  ON transcripts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transcripts_job
  ON transcripts(job_id);

-- Índice GIN para búsqueda de texto en historial
CREATE INDEX IF NOT EXISTS idx_transcripts_text_search
  ON transcripts USING gin(to_tsvector('spanish', text_plain));

-- ---------------------------------------------------------------
-- Trigger: updated_at automático en jobs
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_updated_at ON jobs;
CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------
-- Función: claim_next_job (concurrencia segura para el worker)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_next_job()
RETURNS SETOF jobs LANGUAGE sql AS $$
  UPDATE jobs
  SET    status            = 'downloading',
         worker_claimed_at = now(),
         updated_at        = now()
  WHERE  id = (
    SELECT id
    FROM   jobs
    WHERE  status = 'pending'
    ORDER  BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT  1
  )
  RETURNING *;
$$;

-- ---------------------------------------------------------------
-- RLS: habilitar y crear políticas
-- ---------------------------------------------------------------
ALTER TABLE jobs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;

-- Solo el dueño puede leer/escribir sus propios jobs
DROP POLICY IF EXISTS "jobs_owner" ON jobs;
CREATE POLICY "jobs_owner" ON jobs
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Solo el dueño puede leer/escribir sus propias transcripciones
DROP POLICY IF EXISTS "transcripts_owner" ON transcripts;
CREATE POLICY "transcripts_owner" ON transcripts
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- Storage: buckets
-- (Ejecutar con service_role o desde el dashboard de Supabase)
-- ---------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
  VALUES ('media',   'media',   false)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('results', 'results', false)
  ON CONFLICT (id) DO NOTHING;

-- Política Storage: usuario solo puede subir/leer bajo su user_id en "media"
DROP POLICY IF EXISTS "media_owner_insert" ON storage.objects;
CREATE POLICY "media_owner_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "media_owner_select" ON storage.objects;
CREATE POLICY "media_owner_select" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "media_owner_delete" ON storage.objects;
CREATE POLICY "media_owner_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Política Storage: usuario solo puede leer en "results"
DROP POLICY IF EXISTS "results_owner_select" ON storage.objects;
CREATE POLICY "results_owner_select" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'results'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "results_owner_delete" ON storage.objects;
CREATE POLICY "results_owner_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'results'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
