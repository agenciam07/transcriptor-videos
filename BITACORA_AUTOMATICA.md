# BITÁCORA AUTOMÁTICA — Transcriptor de Videos

## Fase 1 — Repo + Next.js + Supabase Cloud — 2026-11-15

Estado: cerrada (9/9 criterios, 0 minors pendientes)

Resumen: Scaffold Next.js 16 (App Router, TypeScript, Tailwind, shadcn/ui, pnpm) arrancando. Tablas `jobs` y `transcripts` creadas en Supabase cloud con RLS activo, trigger `updated_at` y función `claim_next_job()` con `FOR UPDATE SKIP LOCKED`. Buckets `media` y `results` creados (privados). Auth con registro público deshabilitado. `pnpm build` sin errores. `.env.local` correctamente ignorado por git.

## Fase 2 — Subida de archivos y creación de trabajos — 2026-11-15
Estado: cerrada (9/9 criterios, 1 minor pendiente)
Resumen: Endpoints POST /api/upload-url (URL firmada de Storage), POST /api/jobs (links validados de YT/TK/IG/FB + uploads), GET /api/jobs (paginado con RLS), DELETE /api/jobs/[id] (con limpieza de Storage) funcionando correctamente. RLS verificado: usuario A no ve jobs de usuario B. Minor: @supabase/supabase-js y @supabase/ssr instalados pero no declarados en package.json — el generator debe agregar al próximo fix.
