"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { EmailOtpType } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Status = "checking" | "ready" | "invalid"

const MIN_LENGTH = 8

// Recibe los enlaces de invitación y de recuperación de contraseña que envía Supabase.
// Soporta los tres formatos posibles: tokens en el hash (#access_token=...),
// código PKCE (?code=...) y token_hash (?token_hash=...&type=...).
async function establishSession(): Promise<{ email: string | null; error: string | null }> {
  const supabase = createClient()
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const query = new URLSearchParams(window.location.search)

  const linkError = hash.get("error_description") ?? query.get("error_description")
  if (linkError) return { email: null, error: linkError }

  const accessToken = hash.get("access_token")
  const refreshToken = hash.get("refresh_token")
  const code = query.get("code")
  const tokenHash = query.get("token_hash")
  const type = query.get("type") as EmailOtpType | null

  if (accessToken && refreshToken) {
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
  } else if (code) {
    // El cliente puede haber canjeado el código por su cuenta; si falla, se valida abajo con getUser().
    await supabase.auth.exchangeCodeForSession(code)
  } else if (tokenHash && type) {
    await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  }

  // Quita los tokens de la barra de direcciones y del historial.
  window.history.replaceState(null, "", window.location.pathname)

  const { data } = await supabase.auth.getUser()
  if (!data.user) return { email: null, error: "El enlace no es válido o ya expiró." }
  return { email: data.user.email ?? null, error: null }
}

export default function SetPasswordPage() {
  const router = useRouter()
  const [status, setStatus] = useState<Status>("checking")
  const [email, setEmail] = useState<string | null>(null)
  const [linkError, setLinkError] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    establishSession().then((result) => {
      if (cancelled) return
      setEmail(result.email)
      setLinkError(result.error ?? "")
      setStatus(result.error ? "invalid" : "ready")
    })
    return () => { cancelled = true }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (password.length < MIN_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_LENGTH} caracteres.`)
      return
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.")
      return
    }
    setSaving(true)
    const { error: updateError } = await createClient().auth.updateUser({ password })
    setSaving(false)
    if (updateError) {
      setError(updateError.message.includes("different")
        ? "La nueva contraseña debe ser distinta a la anterior."
        : "No se pudo guardar la contraseña. Inténtalo de nuevo.")
      return
    }
    router.push("/")
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Crea tu contraseña</CardTitle>
          <CardDescription>
            {status === "ready" && email ? `Cuenta: ${email}` : "Transcriptor de Videos"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "checking" && (
            <p className="text-sm text-center text-muted-foreground">Verificando enlace...</p>
          )}

          {status === "invalid" && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-destructive">{linkError}</p>
              <p className="text-sm text-muted-foreground">
                Pide un enlace nuevo desde la pantalla de inicio de sesión.
              </p>
              <Button asChild className="w-full">
                <Link href="/login">Ir a iniciar sesión</Link>
              </Button>
            </div>
          )}

          {status === "ready" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nueva contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={MIN_LENGTH}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Repite la contraseña</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={MIN_LENGTH}
                  autoComplete="new-password"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Guardando..." : "Guardar contraseña"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
