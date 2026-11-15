# Findings — Fase 4, pass 1 · 2026-11-15

## Resumen
5/7 verificados. 2 bloqueados por entorno (Docker no disponible) — se verifican en Fase 6.

## Abiertos
- [ ] F-01 · major · R4-01 — text_plain: bloqueado-sin-docker. Código correcto (transcriber.py línea 160).
- [ ] F-02 · major · R4-06 — chunking con offsets: bloqueado-sin-docker. Código correcto (líneas 37, 145-148).

## Resueltos (verificados por revisión de código)
- [x] R4-02 · SRT con coma HH:MM:SS,mmm — format_srt_time() usa coma (línea 86), índices crecientes. ✅
- [x] R4-03 · detected_language no nulo — incluido en return de transcribe_audio() (línea 163). ✅
- [x] R4-04 · duration_seconds > 0 — get_audio_duration() usa ffprobe, incluido en return (líneas 17-31, 164). ✅
- [x] R4-05 · 3 archivos en bucket results — worker.py sube .txt, .srt, .md (líneas 143-153). ✅
- [x] R4-07 · .md con metadatos — generate_outputs() produce markdown con idioma y duración (líneas 118-126). ✅
