# CONTEXTO_PROYECTO.md — Transcriptor de Videos

## Descripción general

Aplicación web para transcribir videos automáticamente. El usuario pega links de TikTok, Instagram, Facebook o YouTube, o sube archivos de video/audio desde su dispositivo; el sistema descarga, convierte y transcribe usando Groq Whisper, y devuelve el texto con historial y exportación. Todo el procesamiento pesado corre en un worker Docker separado; Vercel solo sirve la interfaz y endpoints ligeros.

---

## Qué debe hacer

1. **Links**: el usuario pega uno o varios links de TikTok, Instagram, Facebook y YouTube; el programa descarga cada video y lo transcribe solo.
2. **Archivos**: subida directa a Supabase Storage (nunca pasa por Vercel) en cualquier formato de video (mp4, mkv, mov, avi, webm, flv, etc.) y audio (mp3, wav, m4a, ogg).
3. **Cola en tiempo real**: muchos trabajos en paralelo, estado visible por trabajo: `pending → downloading → converting → transcribing → done | error`.
4. **Exportación**: texto en pantalla, copiar al portapapeles, descargar `.txt`, `.srt` (subtítulos con timestamps) y `.md`.
5. **Historial**: ver, buscar y borrar transcripciones propias.
6. **Idioma**: detección automática (default español).
7. **Errores**: si un link falla (privado, eliminado, bloqueado), mensaje claro en español, el resto continúa.
8. **Auth**: Supabase Auth con correo y contraseña. Registro público deshabilitado — las cuentas las crea el administrador. RLS activo desde el día uno; cada usuario ve solo sus propios trabajos.

---

## Arquitectura

### GitHub
Repositorio fuente. Cada push a `main` dispara deploy automático en Vercel.

### Vercel (frontend + API ligera)
- Next.js App Router + TypeScript + Tailwind + shadcn/ui + pnpm.
- Sirve la interfaz y endpoints ligeros: crear trabajos, firmar URLs de subida a Storage, leer resultados, cancelar.
- **NUNCA** corre yt-dlp, ffmpeg ni llama a Groq.

### Supabase (nube)
- **Postgres**: tablas `jobs` (cola de trabajos) y `transcripts` (resultados). Migraciones en `supabase/migrations/`, aplicadas con la CLI contra el proyecto cloud.
- **Auth**: correo + contraseña, registro público deshabilitado.
- **Storage**: bucket privado `media` para videos/audios subidos y bucket `results` para `.txt/.srt/.md` generados.
- **Realtime**: el frontend se suscribe a cambios en `jobs` para mostrar progreso en vivo.
- **RLS**: activo en todas las tablas; los usuarios solo leen/escriben sus propios registros.

### Worker (Docker — Railway o Render)
- Carpeta `/worker`, Node.js o Python (decisión del Planner).
- Polling seguro a la tabla `jobs` cada 5 s: selecciona `FOR UPDATE SKIP LOCKED` para evitar que dos workers tomen el mismo trabajo.
- Flujo por trabajo: **descargar** (yt-dlp si es link, o bajar de Storage si es archivo) → **convertir** a WAV mono 16 kHz (ffmpeg) → **transcribir** (Groq Whisper) → **guardar** resultado en Storage + tabla `transcripts` → **marcar** `jobs.status = 'done'`.
- `Dockerfile` con yt-dlp y ffmpeg instalados.
- Manejo de errores: `jobs.status = 'error'`, `jobs.error_message` con texto en español.
- Soporte de cookies (variable de entorno `YT_DLP_COOKIES_B64`) para sitios que bloquen descargas desde servidor.

### Transcripción (Groq Whisper)
- Modelo: `whisper-large-v3-turbo`.
- Antes de enviar: ffmpeg convierte a mono WAV 16 kHz; si supera el límite de la API (25 MB), se parte en chunks, se transcribe cada uno y se unen textos y timestamps del `.srt` correctamente.
- Único servicio externo permitido. Prohibido cualquier otro (pago, email, push, analytics).

---

## Modelo de datos (referencia para el Planner)

### Tabla `jobs`
| campo | tipo | notas |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| user_id | uuid FK → auth.users | RLS by user |
| source_type | text | 'link' \| 'upload' |
| source_url | text | URL original o path en Storage |
| status | text | pending / downloading / converting / transcribing / done / error |
| error_message | text | mensaje de error en español |
| language | text | null = auto-detect |
| created_at | timestamptz | |
| updated_at | timestamptz | trigger on update |
| worker_claimed_at | timestamptz | set por worker al tomar trabajo |

### Tabla `transcripts`
| campo | tipo | notas |
|---|---|---|
| id | uuid PK | |
| job_id | uuid FK → jobs | cascade delete |
| user_id | uuid FK → auth.users | RLS by user |
| text_plain | text | contenido .txt |
| text_srt | text | contenido .srt |
| text_md | text | contenido .md |
| detected_language | text | |
| duration_seconds | integer | |
| created_at | timestamptz | |

---

## Fases del build (orden fijo)

1. **Fase 1 — Repo + Next.js + Supabase cloud**: scaffold de la app, tablas `jobs`/`transcripts`, Auth con registro público apagado, RLS, buckets de Storage privados, cola de trabajos con `FOR UPDATE SKIP LOCKED`.
2. **Fase 2 — Subida de archivos y creación de trabajos**: subida directa a Storage desde el navegador (firma de URL), endpoint para crear trabajos desde links, validación de URLs de TikTok/IG/FB/YT.
3. **Fase 3 — Worker Docker**: toma trabajos de la cola, descarga con yt-dlp, convierte con ffmpeg, manejo de errores con mensajes claros en español.
4. **Fase 4 — Transcripción con Groq Whisper**: chunking de audio largo, detección de idioma, generación de `.txt`/`.srt`/`.md`, unión correcta de tiempos.
5. **Fase 5 — Interfaz**: pegar links/subir archivos, lista de trabajos con progreso en tiempo real (Realtime), vista de resultado, copiar y exportar.
6. **Fase 6 — Historial + despliegue final**: búsqueda, borrado, deploy en Vercel + worker en Railway/Render, pulido de UI, README final.

---

## Seguridad y claves

- Claves en variables de entorno: `.env.local` para desarrollo, paneles de Vercel y del hosting del worker para producción.
- `.env.example` con nombres pero sin valores. `.env*` en `.gitignore`.
- **Nunca commitear claves ni archivos `.env`.**
- `SUPABASE_SERVICE_ROLE_KEY` y `GROQ_API_KEY` solo en el worker (y en Vercel server-side si se necesita); jamás expuestas al navegador.
- Si falta una clave o se requiere un paso manual en un panel (Supabase, Vercel, Railway), el generator se detiene y reporta los pasos exactos.

### Variables de entorno requeridas

**Vercel / `.env.local`:**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

**Worker:**
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
YT_DLP_COOKIES_B64=   # opcional, base64 de cookies.txt para sitios bloqueados
```

---

## Reglas de UI

- Interfaz toda en español.
- Responsive: funciona bien en celular (mínimo 320 px).
- Componentes shadcn/ui estándar, sin librerías extra de UI.
- Sin Playwright: el evaluator prueba llamando endpoints directamente (curl / script) y consultando Supabase con SQL/API REST.

---

## Aviso sobre YouTube / Instagram / Facebook

YouTube y a veces Instagram/Facebook bloquean descargas desde servidores. El worker maneja esto con mensajes claros al usuario. La variable `YT_DLP_COOKIES_B64` permite pasar cookies para sitios que las requieran.
