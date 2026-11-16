"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    const { error: resetError } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/set-password`,
    })
    setLoading(false)
    // Mensaje genérico: no revela si el correo tiene cuenta.
    if (resetError && resetError.status === 429) {
      setError("Demasiados intentos. Espera unos minutos e inténtalo de nuevo.")
    } else {
      setResetSent(true)
    }
  }

  function toggleResetMode() {
    setResetMode(!resetMode)
    setResetSent(false)
    setError("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (authError) {
      setError("Correo o contraseña incorrectos.")
    } else {
      router.push("/")
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Transcriptor de Videos</CardTitle>
          <CardDescription>
            {resetMode ? "Te enviaremos un enlace para crear una contraseña nueva" : "Inicia sesión para continuar"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resetMode ? (
            resetSent ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Si ese correo tiene una cuenta, te llegará un enlace en unos minutos. Revisa también la carpeta de spam.
                </p>
                <Button variant="link" className="w-full" onClick={toggleResetMode}>
                  Volver a iniciar sesión
                </Button>
              </div>
            ) : (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Correo electrónico</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="correo@ejemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Enviando..." : "Enviar enlace"}
                </Button>
                <Button type="button" variant="link" className="w-full" onClick={toggleResetMode}>
                  Volver a iniciar sesión
                </Button>
              </form>
            )
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="correo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Iniciando sesión..." : "Iniciar sesión"}
            </Button>
            <Button type="button" variant="link" className="w-full" onClick={toggleResetMode}>
              ¿Olvidaste tu contraseña?
            </Button>
          </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
