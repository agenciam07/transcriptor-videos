# BITÁCORA AUTOMÁTICA — Transcriptor de Videos

## Fase 1 — Repo + Next.js + Supabase Cloud — 2026-11-15

Estado: cerrada (9/9 criterios, 0 minors pendientes)

Resumen: Scaffold Next.js 16 (App Router, TypeScript, Tailwind, shadcn/ui, pnpm) arrancando. Tablas `jobs` y `transcripts` creadas en Supabase cloud con RLS activo, trigger `updated_at` y función `claim_next_job()` con `FOR UPDATE SKIP LOCKED`. Buckets `media` y `results` creados (privados). Auth con registro público deshabilitado. `pnpm build` sin errores. `.env.local` correctamente ignorado por git.

## Fase 2 — Subida de archivos y creación de trabajos — 2026-11-15
Estado: cerrada (9/9 criterios, 1 minor pendiente)
Resumen: Endpoints POST /api/upload-url (URL firmada de Storage), POST /api/jobs (links validados de YT/TK/IG/FB + uploads), GET /api/jobs (paginado con RLS), DELETE /api/jobs/[id] (con limpieza de Storage) funcionando correctamente. RLS verificado: usuario A no ve jobs de usuario B. Minor: @supabase/supabase-js y @supabase/ssr instalados pero no declarados en package.json — el generator debe agregar al próximo fix.

## Fase 3 — Worker Docker — 2026-11-15
Estado: cerrada-condicionalmente (2/6 verificables por código, 4 bloqueados por entorno Docker)
Resumen: Dockerfile correcto (python:3.12-slim + ffmpeg + yt-dlp). worker.py implementa claim_next_job() via supabase.rpc(), download_video() con ramas link/upload, convert_to_wav() con -ac 1 -ar 16000, upload_wav() a bucket 'media', mensajes de error en español, soporte YT_DLP_COOKIES_B64. Los criterios de integración (docker build, polling real, concurrencia) se verifican en Fase 6 con deploy en Railway/Render.

## Fase 4 — Transcripción Groq Whisper — 2026-11-15
Estado: cerrada-condicionalmente (5/7 verificados por código, 2 bloqueados por entorno Docker)
Resumen: transcriber.py implementa transcribe_audio() con chunking para archivos >24 MB (split_audio con math.ceil + overlap 5s), merge de timestamps correcto (offsets sumados), format_srt_time() produce HH:MM:SS,mmm con coma, generate_outputs() genera .txt/.srt/.md con metadatos. worker.py actualizado: sube 3 archivos a bucket 'results', inserta en tabla transcripts, marca job como 'done'. Los criterios de integración real (texto no vacío, chunking end-to-end) se verifican en Fase 6.
