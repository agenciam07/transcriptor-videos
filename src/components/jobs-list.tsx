"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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

export function JobsList({ refresh }: { refresh: number }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  const loadJobs = useCallback(async () => {
    const res = await fetch("/api/jobs?limit=20")
    if (res.ok) {
      const data = await res.json()
      setJobs(data.jobs ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadJobs() }, [loadJobs, refresh])

  // Supabase Realtime
  useEffect(() => {
    const supabase = createClient()
    let userId: string

    supabase.auth.getUser().then(({ data }) => {
      userId = data.user?.id ?? ""
      if (!userId) return

      const channel = supabase
        .channel("jobs-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "jobs", filter: `user_id=eq.${userId}` },
          (payload) => {
            if (payload.eventType === "INSERT") {
              setJobs((prev) => [payload.new as Job, ...prev])
            } else if (payload.eventType === "UPDATE") {
              setJobs((prev) => prev.map((j) => j.id === payload.new.id ? { ...j, ...(payload.new as Job) } : j))
            } else if (payload.eventType === "DELETE") {
              setJobs((prev) => prev.filter((j) => j.id !== payload.old.id))
            }
          }
        )
        .subscribe()

      return () => { supabase.removeChannel(channel) }
    })
  }, [])

  if (loading) return <p className="text-sm text-muted-foreground text-center py-8">Cargando trabajos...</p>
  if (!jobs.length) return (
    <p className="text-sm text-muted-foreground text-center py-8">
      Aún no tienes trabajos. Pega un link o sube un archivo para empezar.
    </p>
  )

  return (
    <div className="space-y-3">
      {jobs.map((job) => (
        <Card key={job.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{sourceName(job)}</p>
                <p className="text-xs text-muted-foreground">{timeAgo(job.created_at)}</p>
                {job.status === "error" && job.error_message && (
                  <p className="text-xs text-destructive mt-1">{job.error_message}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge variant={STATUS_VARIANT[job.status] ?? "secondary"}>
                  {STATUS_LABEL[job.status] ?? job.status}
                </Badge>
                {job.status === "done" && (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/jobs/${job.id}`}>Ver resultado</Link>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
