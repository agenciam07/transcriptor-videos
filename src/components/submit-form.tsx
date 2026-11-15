"use client"

import { useState, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

export function SubmitForm({ onJobCreated }: { onJobCreated: () => void }) {
  const [links, setLinks] = useState("")
  const [linkLoading, setLinkLoading] = useState(false)
  const [fileLoading, setFileLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleLinks(e: React.FormEvent) {
    e.preventDefault()
    const urls = links.split("\n").map((u) => u.trim()).filter(Boolean)
    if (!urls.length) return
    setLinkLoading(true)
    let ok = 0, fail = 0
    for (const url of urls) {
      try {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "link", url }),
        })
        if (res.ok) { ok++ } else {
          const data = await res.json()
          toast.error(data.error ?? `Error con ${url}`)
          fail++
        }
      } catch {
        fail++
      }
    }
    setLinkLoading(false)
    if (ok > 0) {
      toast.success(`${ok} trabajo${ok > 1 ? "s" : ""} enviado${ok > 1 ? "s" : ""}`)
      setLinks("")
      onJobCreated()
    }
  }

  async function handleFile(file: File) {
    setFileLoading(true)
    try {
      // 1. Obtener URL firmada
      const urlRes = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream" }),
      })
      if (!urlRes.ok) throw new Error("No se pudo obtener la URL de subida")
      const { uploadUrl, path, jobId } = await urlRes.json()

      // 2. Subir directo a Supabase Storage
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      })
      if (!uploadRes.ok) throw new Error("Error al subir el archivo")

      // 3. Crear trabajo
      const jobRes = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "upload", storagePath: path, jobId }),
      })
      if (!jobRes.ok) {
        const data = await jobRes.json()
        throw new Error(data.error ?? "Error al crear el trabajo")
      }
      toast.success(`Archivo "${file.name}" enviado`)
      onJobCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al subir el archivo")
    } finally {
      setFileLoading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <Tabs defaultValue="links">
      <TabsList className="w-full">
        <TabsTrigger value="links" className="flex-1">Pegar links</TabsTrigger>
        <TabsTrigger value="file" className="flex-1">Subir archivo</TabsTrigger>
      </TabsList>

      <TabsContent value="links">
        <form onSubmit={handleLinks} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="links">Links de TikTok, Instagram, Facebook o YouTube</Label>
            <Textarea
              id="links"
              placeholder={"https://www.youtube.com/watch?v=...\nhttps://www.tiktok.com/@..."}
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              rows={4}
              className="resize-none font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">Un link por línea. Se procesarán en cola.</p>
          </div>
          <Button type="submit" disabled={linkLoading || !links.trim()} className="w-full">
            {linkLoading ? "Enviando..." : "Transcribir"}
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="file">
        <div className="space-y-3">
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const file = e.dataTransfer.files[0]
              if (file) handleFile(file)
            }}
            onClick={() => fileRef.current?.click()}
          >
            <p className="text-sm text-muted-foreground">
              Arrastra un archivo aquí o <span className="text-primary underline">haz clic para seleccionar</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              mp4, mkv, mov, avi, webm, flv, mp3, wav, m4a, ogg y más
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="video/*,audio/*,.mkv,.flv,.srt,.webm"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
          {fileLoading && (
            <p className="text-sm text-center text-muted-foreground">Subiendo archivo...</p>
          )}
        </div>
      </TabsContent>
    </Tabs>
  )
}
