"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import Link from "next/link"

type Job = {
  id: string
  status: string
  source_type: string
  source_url: string
  error_message: string | null
  created_at: string
  updated_at: string
  user_id: string
  transcript_preview: string | null
  detected_language: string | null
  duration_seconds: number | null
}

const STATUS_LABEL: Record<string, string> = {
  pending: "En espera",
  downloading: "Descargando",
  converting: "Convirtiendo",
  transcribing: "Transcribiendo",
  done: "Listo",
  error: "Error",
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  downloading: "default",
  converting: "default",
  transcribing: "default",
  done: "default",
  error: "destructive",
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "hace un momento"
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.floor(hours / 24)} d`
}

function sourceName(job: Job): string {
  if (job.source_type === "link") {
    try { return new URL(job.source_url).hostname.replace("www.", "") } catch { return job.source_url }
  }
  const parts = job.source_url.split("/")
  return parts[parts.length - 1] || "archivo"
}

function formatDuration(secs: number | null): string {
  if (!secs) return ""
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

type JobsResponse = { jobs: Job[]; nextCursor: string | null }

async function fetchJobs(q?: string, cursor?: string): Promise<JobsResponse | null> {
  const params = new URLSearchParams({ limit: "20" })
  if (q) params.set("q", q)
  if (cursor) params.set("cursor", cursor)
  try {
    const res = await fetch(`/api/jobs?${params}`)
    if (!res.ok) return null
    const data = await res.json()
    return { jobs: data.jobs ?? [], nextCursor: data.nextCursor ?? null }
  } catch {
    return null
  }
}

export function JobsList({ refresh }: { refresh: number }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const applyResult = useCallback((data: JobsResponse | null, append: boolean) => {
    if (data) {
      setJobs((prev) => (append ? [...prev, ...data.jobs] : data.jobs))
      setNextCursor(data.nextCursor)
    }
    setLoading(false)
    setLoadingMore(false)
  }, [])

  const loadJobs = useCallback(async (q?: string, cursor?: string) => {
    applyResult(await fetchJobs(q, cursor), !!cursor)
  }, [applyResult])

  useEffect(() => {
    let cancelled = false
    fetchJobs().then((data) => {
      if (!cancelled) applyResult(data, false)
    })
    return () => { cancelled = true }
  }, [applyResult, refresh])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setSearch(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setLoading(true)
      loadJobs(val || undefined)
    }, 400)
  }

  const handleDelete = async (jobId: string) => {
    if (!confirm("¿Borrar esta transcripción?")) return
    const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" })
    if (res.ok) {
      setJobs((prev) => prev.filter((j) => j.id !== jobId))
    }
  }

  const handleLoadMore = () => {
    if (!nextCursor) return
    setLoadingMore(true)
    loadJobs(search || undefined, nextCursor)
  }

  // Supabase Realtime
  useEffect(() => {
    const supabase = createClient()
    let channel: RealtimeChannel | null = null
    let cancelled = false

    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id
      if (!userId || cancelled) return

      channel = supabase
        .channel("jobs-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "jobs", filter: `user_id=eq.${userId}` },
          (payload) => {
            if (payload.eventType === "INSERT") {
              const inserted = payload.new as Job
              setJobs((prev) => prev.some((j) => j.id === inserted.id) ? prev : [inserted, ...prev])
            } else if (payload.eventType === "UPDATE") {
              setJobs((prev) => prev.map((j) => j.id === payload.new.id ? { ...j, ...(payload.new as Job) } : j))
            } else if (payload.eventType === "DELETE") {
              setJobs((prev) => prev.filter((j) => j.id !== payload.old.id))
            }
          }
        )
        .subscribe()
    })

    // Antes el cleanup se devolvía dentro de la promesa y nunca se ejecutaba,
    // así que cada montaje dejaba un canal Realtime abierto.
    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  return (
    <div className="space-y-3">
      <Input
        placeholder="Buscar en transcripciones..."
        value={search}
        onChange={handleSearchChange}
        className="mb-4"
      />

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Cargando trabajos...</p>
      ) : !jobs.length ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {search ? "Sin resultados para esa búsqueda." : "Aún no tienes trabajos. Pega un link o sube un archivo para empezar."}
        </p>
      ) : (
        <>
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{sourceName(job)}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>{timeAgo(job.created_at)}</span>
                      {job.detected_language && <span>· {job.detected_language}</span>}
                      {job.duration_seconds && <span>· {formatDuration(job.duration_seconds)}</span>}
                    </div>
                    {job.status === "error" && job.error_message && (
                      <p className="text-xs text-destructive mt-1">{job.error_message}</p>
                    )}
                    {job.status === "done" && job.transcript_preview && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{job.transcript_preview}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                    <Badge variant={STATUS_VARIANT[job.status] ?? "secondary"}>
                      {STATUS_LABEL[job.status] ?? job.status}
                    </Badge>
                    {job.status === "done" && (
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/jobs/${job.id}`}>Ver</Link>
                      </Button>
                    )}
                    {(job.status === "done" || job.status === "error") && (
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(job.id)}>
                        Borrar
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {nextCursor && (
            <div className="text-center pt-2">
              <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? "Cargando..." : "Cargar más"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
