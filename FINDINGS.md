# Findings — Fase 2, pass 1 · 2026-11-15

## Resumen
9/9 criterios del rubric de esta fase pasan.

## Abiertos
_(ninguno)_

## Resueltos (verificados este pass)
- [x] R2-01 · POST /api/upload-url sin JWT → 401 ✓
- [x] R2-02 · POST /api/upload-url con JWT válido → 200 con {uploadUrl, path, jobId} ✓
- [x] R2-03 · POST /api/jobs con URL de YouTube → 201, job status='pending' en DB ✓
- [x] R2-04 · POST /api/jobs con URL de TikTok → 201 ✓
- [x] R2-05 · POST /api/jobs con URL inválida → 400 con mensaje en español ✓
- [x] R2-06 · POST /api/jobs con storagePath → 201, source_type='upload' ✓
- [x] R2-07 · GET /api/jobs → solo jobs del usuario autenticado (RLS) ✓
- [x] R2-08 · DELETE /api/jobs/<job_de_B> con JWT de A → 404 ✓
- [x] R2-09 · DELETE /api/jobs/<job_propio> → 200, eliminado de DB ✓

Nota minor: @supabase/supabase-js y @supabase/ssr están en node_modules pero no en package.json.
