import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

// Ruta del mismo dominio que Vercel reenvía a Supabase (ver rewrites en next.config.ts).
// El navegador nunca habla directo con *.supabase.co: algunas redes no llegan ahí.
export const SUPABASE_PROXY_PATH = '/supabase'

// Al cambiar la URL, @supabase/ssr derivaría otro nombre de cookie a partir del host.
// Lo fijamos al mismo que usa el servidor (que sí usa la URL directa) para compartir sesión.
const AUTH_COOKIE_NAME = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`

export function createClient() {
  const url = typeof window === 'undefined'
    ? SUPABASE_URL
    : `${window.location.origin}${SUPABASE_PROXY_PATH}`

  return createBrowserClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { name: AUTH_COOKIE_NAME },
  })
}

/** Convierte una URL firmada de Supabase en la misma ruta pasando por el proxy. */
export function toProxyUrl(supabaseUrl: string): string {
  const u = new URL(supabaseUrl)
  return `${SUPABASE_PROXY_PATH}${u.pathname}${u.search}`
}
