"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

type Transcript = {
  text_plain: string
  text_srt: string
  text_md: string
  detected_language: string | null
  duration_seconds: number | null
}

export function JobResultClient({ id }: { id: string }) {
  const router = useRouter()
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeFormat, setActiveFormat] = useState<"plain" | "srt" | "md">("plain")

  useEffect(() => {
    fetch(`/api/jobs/${id}/transcript`)
      .then((r) => r.json())
      .then((data) => { setTranscript(data); setLoading(false) })
      .catch(() => { toast.error("No se pudo cargar la transcripción"); setLoading(false) })
  }, [id])

  async function handleCopy() {
    const text = activeFormat === "plain" ? transcript?.text_plain :
                 activeFormat === "srt" ? transcript?.text_srt : transcript?.text_md
    if (!text) return
    await navigator.clipboard.writeText(text)
    toast.success("Texto copiado")
  }

  function handleDownload(format: "txt" | "srt" | "md") {
    if (!transcript) return
    const text = format === "txt" ? transcript.text_plain :
                 format === "srt" ? transcript.text_srt : transcript.text_md
    if (!text) { toast.error("No hay contenido para descargar"); return }
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `transcripcion.${format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const currentText = !transcript ? "" :
    activeFormat === "plain" ? transcript.text_plain :
    activeFormat === "srt" ? transcript.text_srt : transcript.text_md

  return (
    <div className="min-h-screen">
      <header className="border-b sticky top-0 z-10 bg-background/95 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/")}>← Volver</Button>
          <span className="font-semibold text-sm">Resultado de transcripción</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {loading && <p className="text-sm text-muted-foreground text-center py-8">Cargando...</p>}

        {!loading && transcript && (
          <>
            {(transcript.detected_language || transcript.duration_seconds) && (
              <div className="flex gap-4 text-sm text-muted-foreground">
                {transcript.detected_language && (
                  <span>Idioma: <strong>{transcript.detected_language}</strong></span>
                )}
                {transcript.duration_seconds && (
                  <span>Duración: <strong>
                    {Math.floor(transcript.duration_seconds / 60)}:{String(transcript.duration_seconds % 60).padStart(2, "0")}
                  </strong></span>
                )}
              </div>
            )}

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm">Transcripción</CardTitle>
                  <div className="flex gap-1">
                    {(["plain", "srt", "md"] as const).map((f) => (
                      <Button
                        key={f}
                        size="sm"
                        variant={activeFormat === f ? "default" : "outline"}
                        onClick={() => setActiveFormat(f)}
                        className="h-7 text-xs px-2"
                      >
                        {f === "plain" ? "Texto" : f === "srt" ? "SRT" : "Markdown"}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={currentText}
                  readOnly
                  rows={16}
                  className="font-mono text-sm resize-none"
                />
              </CardContent>
            </Card>

            <div className="flex gap-2 flex-wrap">
              <Button onClick={handleCopy} variant="outline">Copiar texto</Button>
              <Button onClick={() => handleDownload("txt")} variant="outline">Descargar .txt</Button>
              <Button onClick={() => handleDownload("srt")} variant="outline">Descargar .srt</Button>
              <Button onClick={() => handleDownload("md")} variant="outline">Descargar .md</Button>
            </div>
          </>
        )}

        {!loading && !transcript && (
          <p className="text-sm text-muted-foreground text-center py-8">No se encontró la transcripción.</p>
        )}
      </main>
    </div>
  )
}
