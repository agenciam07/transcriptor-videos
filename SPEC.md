# SPEC.md — Transcriptor de Videos

## 1. Objetivo

Aplicación web que permite a usuarios autenticados transcribir videos y audios pegando links (TikTok, Instagram, Facebook, YouTube) o subiendo archivos, con procesamiento en cola, progreso en tiempo real e historial con exportación en .txt, .srt y .md.

---

## 2. Arquitectura general

```
[Navegador]
    │  HTTPS
    ▼
[Vercel — Next.js App Router]
  ├── UI: páginas y componentes React
  ├── API Routes (server-side):
  │     POST /api/jobs          → crea trabajo (link o archivo)
  │     GET  /api/jobs          → lista trabajos del usuario
  │     DELETE /api/jobs/[id]   → borra trabajo + transcripción
  │     POST /api/upload-url    → genera URL firmada para subida a Storage
  └── Supabase Realtime client  → suscripción a cambios en tabla jobs
        │
        │ supabase-js (service_role en server, anon en client)
        ▼
[Supabase Cloud]
  ├── Postgres:  jobs, transcripts (RLS activo)
  ├── Auth:      correo+contraseña, signup deshabilitado
  ├── Storage:   bucket "media" (uploads), bucket "results" (outputs)
  └── Realtime:  cambios en tabla jobs → cliente
        │
        │ polling SELECT FOR UPDATE SKIP LOCKED
        ▼
[Worker — Docker en Railway/Render]
  ├── yt-dlp   → descarga video desde link
  ├── ffmpeg   → convierte a WAV mono 16 kHz
  └── Groq API → whisper-large-v3-turbo → transcripción
        │
        │ escribe resultado
        ▼
[Supabase Storage + tabla transcripts]
```

**Reglas de arquitectura:**
- Vercel NUNCA ejecuta yt-dlp, ffmpeg ni llama a Groq.
- `SUPABASE_SERVICE_ROLE_KEY` y `GROQ_API_KEY` solo en el worker y en Vercel server-side; jamás en el navegador (`NEXT_PUBLIC_`).
- Único servicio externo: Groq Whisper. Prohibido cualquier otro.

---

## 3. Modelo de datos completo

### 3.1 Tabla `jobs`

```sql
CREATE TABLE jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type      text NOT NULL CHECK (source_type IN ('link', 'upload')),
  source_url       text NOT NULL,          -- URL original o path en Storage bucket "media"
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','downloading','converting','transcribing','done','error')),
  error_message    text,                   -- mensaje en español, nulo si no hay error
  language         text,                   -- null = auto-detect
  worker_claimed_at timestamptz,           -- set por worker al tomar trabajo
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Índice para el worker (cola de pendientes)
CREATE INDEX idx_jobs_status_created ON jobs(status, created_at)
  WHERE status = 'pending';
```

### 3.2 Tabla `transcripts`

```sql
CREATE TABLE transcripts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text_plain        text NOT NULL,
  text_srt          text NOT NULL,
  text_md           text NOT NULL,
  detected_language text,
  duration_seconds  integer,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transcripts_user ON transcripts(user_id, created_at DESC);
CREATE INDEX idx_transcripts_job  ON transcripts(job_id);
```

### 3.3 Función de polling del worker (concurrencia segura)

```sql
-- Usada por el worker vía SQL directo con service_role
-- El worker ejecuta: SELECT * FROM claim_next_job();
CREATE OR REPLACE FUNCTION claim_next_job()
RETURNS SETOF jobs LANGUAGE sql AS $$
  UPDATE jobs
  SET    status = 'downloading',
         worker_claimed_at = now(),
         updated_at = now()
  WHERE  id = (
    SELECT id FROM jobs
    WHERE  status = 'pending'
    ORDER  BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT  1
  )
  RETURNING *;
$$;
```

---

## 4. RLS

```sql
-- Habilitar RLS en ambas tablas
ALTER TABLE jobs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;

-- jobs: solo el dueño puede leer/insertar/actualizar/borrar
CREATE POLICY "jobs_owner" ON jobs
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- transcripts: solo el dueño puede leer/borrar
CREATE POLICY "transcripts_owner" ON transcripts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

**Nota:** el worker usa `service_role` key que bypasa RLS. Vercel server-side usa `service_role` para operaciones administrativas; el cliente (browser) usa `anon` key con sesión JWT, sujeto a RLS.

---

## 5. Storage

```
Bucket "media"   (privado) — videos/audios subidos por el usuario
  path: {user_id}/{job_id}/original.{ext}

Bucket "results" (privado) — outputs generados por el worker
  path: {user_id}/{job_id}/transcript.txt
  path: {user_id}/{job_id}/transcript.srt
  path: {user_id}/{job_id}/transcript.md
```

Políticas de Storage (RLS equivalente):
- `media`: el usuario solo puede subir/leer archivos bajo su `user_id/`.
- `results`: el usuario solo puede leer archivos bajo su `user_id/`.
- El worker (service_role) tiene acceso total.

---

## 6. Variables de entorno

### Vercel / `.env.local`
| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anon (pública, va al browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave service_role (solo server-side) |

### Worker
| Variable | Descripción |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave service_role |
| `GROQ_API_KEY` | Clave de Groq (whisper-large-v3-turbo) |
| `YT_DLP_COOKIES_B64` | Opcional: base64 de cookies.txt para YT/IG/FB bloqueados |

---

## 7. Fases secuenciales

### Fase 1 — Repo + Next.js + Supabase Cloud

**Objetivo:** Scaffold de la aplicación con base de datos, Auth, Storage y cola de trabajos funcional.

**Entregables:**
1. Repositorio git inicializado con `.gitignore` correcto (`.env*` ignorado).
2. App Next.js 14+ (App Router, TypeScript, Tailwind, shadcn/ui, pnpm) arrancando sin errores (`pnpm dev`).
3. Migraciones en `supabase/migrations/` aplicadas al proyecto cloud:
   - Tablas `jobs` y `transcripts` con constraints, triggers y función `claim_next_job()`.
   - RLS activo con políticas correctas.
   - Buckets `media` y `results` creados con políticas de Storage.
4. Auth configurado: registro público deshabilitado.
5. Cliente Supabase configurado en `lib/supabase/` (client y server).
6. Route handler `GET /api/health` que devuelve `{ok: true, supabase: true}` si la conexión a Supabase funciona.

**Criterios del rubric (Fase 1):**
- R1-01: `GET /api/health` devuelve 200 con `{ok:true, supabase:true}`.
- R1-02: La tabla `jobs` existe con todas las columnas definidas (query SQL: `SELECT column_name FROM information_schema.columns WHERE table_name='jobs'`).
- R1-03: La tabla `transcripts` existe con todas las columnas definidas.
- R1-04: RLS está activo en `jobs` (query: `SELECT rowsecurity FROM pg_tables WHERE tablename='jobs'` → `true`).
- R1-05: RLS está activo en `transcripts`.
- R1-06: Un usuario A autenticado no puede leer los `jobs` de un usuario B (insert job con service_role como user B, luego GET /api/jobs autenticado como user A → array vacío).
- R1-07: La función `claim_next_job()` existe y retorna 0 filas cuando no hay pendientes.
- R1-08: `pnpm build` termina sin errores de TypeScript.
- R1-09: `.env.local` no aparece en `git status` (está en .gitignore).

---

### Fase 2 — Subida de archivos y creación de trabajos

**Objetivo:** El usuario puede subir archivos a Storage directamente desde el navegador y crear trabajos desde links o archivos.

**Entregables:**
1. `POST /api/upload-url` — genera una URL firmada de Supabase Storage para subida directa; devuelve `{uploadUrl, path}`. Requiere JWT válido.
2. `POST /api/jobs` — acepta `{type: 'link', url}` o `{type: 'upload', storagePath}`, valida, inserta en `jobs` con `status='pending'`, devuelve el job creado. Requiere JWT válido.
3. Validación de URLs: acepta solo dominios de TikTok (`tiktok.com`), Instagram (`instagram.com`), Facebook (`facebook.com`), YouTube (`youtube.com`, `youtu.be`). Rechaza todo lo demás con 400 y mensaje en español.
4. `GET /api/jobs` — devuelve lista de jobs del usuario autenticado (via RLS), paginado (limit 20, cursor por `created_at`).
5. `DELETE /api/jobs/[id]` — borra job + transcript asociada + archivos en Storage. Solo el dueño puede borrar (RLS lo garantiza, el handler verifica 404 si no existe).

**Criterios del rubric (Fase 2):**
- R2-01: `POST /api/upload-url` sin JWT → 401.
- R2-02: `POST /api/upload-url` con JWT válido → 200 con `uploadUrl` y `path`.
- R2-03: `POST /api/jobs` con URL de YouTube válida → 201, job en DB con `status='pending'`.
- R2-04: `POST /api/jobs` con URL de TikTok válida → 201.
- R2-05: `POST /api/jobs` con URL inválida (ej. `https://ejemplo.com/video`) → 400 con mensaje de error en español.
- R2-06: `POST /api/jobs` con storagePath válido → 201, job con `source_type='upload'`.
- R2-07: `GET /api/jobs` retorna solo los jobs del usuario autenticado (no los de otro usuario).
- R2-08: `DELETE /api/jobs/[id]` de un job ajeno → 404 (RLS lo bloquea).
- R2-09: `DELETE /api/jobs/[id]` del propio job → 200 y el job desaparece de la DB.

---

### Fase 3 — Worker Docker

**Objetivo:** Worker que toma trabajos de la cola, descarga y convierte audio, con manejo de errores.

**Entregables:**
1. Carpeta `/worker` con estructura:
   - `Dockerfile`: imagen base Python o Node, instala yt-dlp y ffmpeg, copia código del worker.
   - `worker.py` (o `worker.js`): loop principal con polling cada 5 s.
   - `requirements.txt` o `package.json`.
2. Lógica de polling: `SELECT claim_next_job()` cada 5 s; si retorna una fila, procesa ese job.
3. Para `source_type='link'`: descarga con `yt-dlp` a archivo temporal; actualiza `status='downloading'`.
4. Conversión con ffmpeg a WAV mono 16 kHz; actualiza `status='converting'`.
5. Sube el WAV convertido a Storage bucket `media` bajo `{user_id}/{job_id}/audio.wav`.
6. Manejo de errores: si yt-dlp o ffmpeg fallan, `status='error'` con `error_message` descriptivo en español.
7. Mensajes de error específicos:
   - Video privado/eliminado: "El video no está disponible (privado o eliminado)."
   - Bloqueado geo/servidor: "El sitio bloquea descargas desde servidores. Si es YouTube, considera usar cookies."
   - Formato no soportado: "Formato de archivo no compatible."
   - Error genérico: "Error al procesar el video. Inténtalo de nuevo."
8. Variable `YT_DLP_COOKIES_B64`: si está definida, decodifica base64 y la pasa a yt-dlp como archivo de cookies.
9. `docker build` funciona sin errores.

**Criterios del rubric (Fase 3):**
- R3-01: `docker build -t worker ./worker` termina sin errores.
- R3-02: Insertar un job `pending` con link de YouTube público → worker lo toma, pasa por `downloading`→`converting`, sube `audio.wav` a Storage, actualiza status (verificar con query SQL y Storage API).
- R3-03: Insertar dos jobs `pending` simultáneamente con dos workers → cada worker toma uno diferente (verificar `worker_claimed_at` y `id` distintos).
- R3-04: Link de video inválido/inexistente → job termina en `status='error'` con `error_message` no vacío en español.
- R3-05: `source_type='upload'`: el worker descarga el archivo desde Storage bucket `media` y lo convierte a WAV correctamente.
- R3-06: El audio convertido es WAV, mono (1 canal), 16 kHz (verificar con `ffprobe` o equivalente).

---

### Fase 4 — Transcripción con Groq Whisper

**Objetivo:** Worker transcribe el audio con Groq Whisper y guarda los resultados en Storage y DB.

**Entregables:**
1. El worker, después de convertir, actualiza `status='transcribing'` y llama a Groq `whisper-large-v3-turbo`.
2. Si el WAV es mayor a 24 MB (margen de seguridad respecto al límite de 25 MB de Groq):
   - ffmpeg lo divide en chunks de máximo 10 minutos con 5 s de overlap.
   - Transcribe cada chunk.
   - Une los textos y los timestamps del SRT ajustando el offset de tiempo correctamente.
3. Genera tres formatos:
   - `.txt`: texto plano sin timestamps.
   - `.srt`: formato SubRip con timestamps crecientes (`00:00:00,000 --> 00:00:05,123`).
   - `.md`: texto con encabezado con metadatos (duración, idioma detectado, fecha).
4. Sube los tres archivos a Storage bucket `results` bajo `{user_id}/{job_id}/`.
5. Inserta fila en `transcripts` con `text_plain`, `text_srt`, `text_md`, `detected_language`, `duration_seconds`.
6. Actualiza `jobs.status = 'done'`.
7. Limpia archivos temporales del sistema de archivos del worker.

**Criterios del rubric (Fase 4):**
- R4-01: Un audio corto (<24 MB) → `transcripts.text_plain` no vacío y `status='done'`.
- R4-02: El `.srt` generado tiene timestamps válidos en formato `HH:MM:SS,mmm --> HH:MM:SS,mmm` y son estrictamente crecientes (verificar con regex y comparación de tiempos).
- R4-03: `transcripts.detected_language` no es nulo.
- R4-04: `transcripts.duration_seconds` > 0.
- R4-05: Los tres archivos (`.txt`, `.srt`, `.md`) existen en Storage bucket `results` (verificar con Storage API).
- R4-06: Un audio largo (>24 MB, si disponible) termina con `status='done'` y texto completo no vacío; los timestamps del SRT no reinician a 0 en cada chunk.
- R4-07: El `.md` contiene metadatos (idioma y duración).

---

### Fase 5 — Interfaz

**Objetivo:** Interfaz completa en español, responsive, con progreso en tiempo real.

**Entregables:**
1. **Página principal** (`/`): formulario con dos pestañas:
   - "Pegar links": textarea para pegar uno o varios links (uno por línea).
   - "Subir archivo": input de archivo con drag & drop, acepta `video/*,audio/*,.mkv,.flv,.srt`.
   - Botón "Transcribir" que crea los jobs via `/api/jobs`.
2. **Lista de trabajos** (en la misma página o `/jobs`): muestra todos los jobs del usuario con:
   - Estado visual (ícono/badge): En espera / Descargando / Convirtiendo / Transcribiendo / Listo / Error.
   - Barra de progreso o spinner según el estado.
   - Tiempo transcurrido.
   - Actualización en tiempo real via Supabase Realtime (suscripción a `jobs` del usuario).
3. **Vista de resultado**: al hacer clic en un job `done`, muestra el texto transcrito con:
   - Texto completo visible (scrollable).
   - Botón "Copiar texto" (clipboard API).
   - Botones de descarga: `.txt`, `.srt`, `.md`.
4. **Manejo de errores**: si un job tiene `status='error'`, muestra `error_message` en rojo con ícono.
5. **Página de login** (`/login`): formulario correo + contraseña. Sin opción de registro. Redirige a `/` si ya está autenticado.
6. **Protección de rutas**: todas las páginas excepto `/login` requieren sesión activa; redirect a `/login` si no hay sesión.
7. UI toda en español, responsive (mínimo 320 px de ancho), dark/light mode respetando preferencia del sistema.

**Criterios del rubric (Fase 5):**
- R5-01: `GET /login` carga sin errores (curl → 200).
- R5-02: `GET /` sin sesión → redirect a `/login` (curl sin cookie → 302 o redirect en HTML).
- R5-03: `POST /api/jobs` con JWT → job aparece en la lista de trabajos en la DB.
- R5-04: Supabase Realtime: cambiar `status` de un job en DB → la fila en `jobs` se actualiza (verificar via API de Supabase que el cambio persiste; el test de Realtime en cliente es manual/visual).
- R5-05: La descarga de `.txt` via Storage URL firmada retorna el contenido de texto correcto (curl → contenido no vacío).
- R5-06: La descarga de `.srt` via Storage URL firmada retorna contenido con formato SRT válido.
- R5-07: `pnpm build` sin errores.

---

### Fase 6 — Historial + despliegue final

**Objetivo:** Historial con búsqueda y borrado, despliegue en producción, README final.

**Entregables:**
1. **Historial** (`/history` o integrado en `/`):
   - Lista de transcripciones pasadas con fecha, duración, idioma y preview del texto.
   - Búsqueda por texto (filtra sobre `transcripts.text_plain` con `ILIKE`).
   - Borrar transcripción individual (llama a `DELETE /api/jobs/[id]`).
   - Paginación (20 por página).
2. **Deploy en Vercel**:
   - Repositorio conectado a Vercel (GitHub → Vercel auto-deploy en push a `main`).
   - Variables de entorno configuradas en el panel de Vercel.
   - App accesible en URL pública de Vercel.
3. **Worker en Railway o Render**:
   - Dockerfile desplegado.
   - Variables de entorno (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`) configuradas.
   - Worker corriendo y procesando jobs de producción.
4. **README.md** con:
   - Descripción del proyecto.
   - Cómo usar: pegar links, subir archivos, descargar resultado.
   - Cómo hacer deploy (variables de entorno, pasos).
   - Cómo publicar cambios futuros (`git push origin main`).

**Criterios del rubric (Fase 6):**
- R6-01: `GET https://<url-vercel>/api/health` devuelve 200 con `{ok:true}` (app en producción).
- R6-02: Búsqueda en historial: insertar transcript con texto conocido → `GET /api/jobs?q=<palabra>` devuelve ese job.
- R6-03: Borrar job → job y transcript desaparecen de la DB (query SQL de verificación).
- R6-04: La paginación devuelve máximo 20 items y un cursor para la siguiente página.
- R6-05: README.md existe con secciones de uso y deploy.

---

## 8. Assumptions

1. **Worker en Python**: se usa Python para el worker porque la integración de yt-dlp y ffmpeg-python es más madura y directa que en Node. Se usa `httpx` para llamar a la API de Groq.

2. **Polling cada 5 s**: intervalo razonable entre costo de DB y latencia percibida. Ajustable via variable de entorno `WORKER_POLL_INTERVAL_MS`.

3. **Groq Whisper límite**: se usa 24 MB como umbral (conservador vs el límite oficial de 25 MB) para triggear el chunking.

4. **Chunk overlap de 5 s**: evita cortar palabras en el límite. Los timestamps del SRT se ajustan con el offset acumulado.

5. **Autenticación solo con correo+contraseña**: el registro público está deshabilitado en Supabase Auth. No hay OAuth social.

6. **Storage privado**: todos los archivos son privados. Las URLs de descarga son URLs firmadas con expiración de 1 hora.

7. **Concurrencia de workers**: la función `claim_next_job()` con `FOR UPDATE SKIP LOCKED` garantiza que dos workers no tomen el mismo job. Se puede escalar horizontalmente sin cambios.

8. **Idioma por defecto**: se pasa `language=null` a Groq (auto-detect). El usuario puede especificar idioma en el futuro.

9. **Formato .md**: incluye un encabezado YAML-like con metadatos (fecha, idioma, duración) seguido del texto plano.

10. **Búsqueda en historial**: búsqueda simple con `ILIKE %q%` sobre `text_plain`. No se implementa búsqueda full-text con `tsvector` para mantener la simplicidad.

11. **Limpieza de archivos temporales**: el worker borra los archivos temporales (video descargado, WAV convertido) después de subir a Storage, independientemente de si la transcripción tuvo éxito o error.

12. **Sin cancelación de jobs**: una vez en proceso, un job no se puede cancelar. Se puede borrar después de completado o fallido.

---

## 9. Rubric completo (resumen por fase)

| Fase | Criterios |
|------|-----------|
| Fase 1 | R1-01 a R1-09 (9 criterios) |
| Fase 2 | R2-01 a R2-09 (9 criterios) |
| Fase 3 | R3-01 a R3-06 (6 criterios) |
| Fase 4 | R4-01 a R4-07 (7 criterios) |
| Fase 5 | R5-01 a R5-07 (7 criterios) |
| Fase 6 | R6-01 a R6-05 (5 criterios) |
| **Total** | **43 criterios** |
