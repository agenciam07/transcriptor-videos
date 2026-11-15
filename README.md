# Transcriptor de Videos

Aplicación web para transcribir videos automáticamente desde links o archivos subidos. Soporta YouTube, TikTok, Instagram, Facebook y cualquier formato de video o audio.

## Cómo usar

### Pegar links
1. Inicia sesión con tu correo y contraseña
2. En la pestaña **"Pegar links"**, escribe o pega los links (uno por línea) de YouTube, TikTok, Instagram o Facebook
3. Haz clic en **"Transcribir"**
4. Espera a que el estado cambie a **"Listo"** (se actualiza en tiempo real)
5. Haz clic en **"Ver"** → lee el texto y descárgalo en `.txt`, `.srt` o `.md`

### Subir archivos
1. Ve a la pestaña **"Subir archivo"**
2. Arrastra o selecciona un video/audio (mp4, mkv, mov, avi, webm, flv, mp3, wav, m4a, etc.)
3. El archivo se sube directo — no pasa por el servidor web
4. Sigue los pasos 3-5 de arriba

### Buscar en el historial
Usa el campo de búsqueda en la lista de trabajos para filtrar por texto dentro de las transcripciones.

## Publicar cambios futuros

```bash
git add .
git commit -m "descripción del cambio"
git push origin main
# Vercel despliega automáticamente en 1-2 minutos
```

## Variables de entorno

### Vercel (frontend)
| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave privada de Supabase (solo server-side) |

### Worker (Railway / Render)
| Variable | Descripción |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave privada de Supabase |
| `GROQ_API_KEY` | Clave de Groq (Whisper) |
| `YT_DLP_COOKIES_B64` | Opcional: cookies en base64 para sitios bloqueados |

## Deploy

### 1. Vercel (frontend + API)
1. Sube el código a un repo de GitHub
2. Ve a [vercel.com](https://vercel.com) → **New Project** → importa el repo
3. En **Environment Variables**, agrega las 3 variables de Vercel
4. Haz clic en **Deploy**
5. Cada `git push origin main` despliega automáticamente

### 2. Worker (Railway o Render)
1. Ve a [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
2. Selecciona el repo y elige la carpeta `/worker` (o configura el Dockerfile path)
3. En **Variables**, agrega las 4 variables del worker
4. Railway detecta el `Dockerfile` y hace el build automáticamente

## Desarrollo local

```bash
# Instalar dependencias
pnpm install

# Iniciar el servidor de desarrollo
pnpm dev

# Verificar tipos TypeScript
pnpm typecheck

# Build de producción
pnpm build
```

La app corre en http://localhost:3000. El worker corre por separado — necesita Docker.
