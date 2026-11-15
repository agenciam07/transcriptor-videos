import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }

  // Verify job belongs to user (RLS enforces this)
  const { data: job } = await supabase.from("jobs").select("id").eq("id", id).single()
  if (!job) return NextResponse.json({ error: "Trabajo no encontrado" }, { status: 404 })

  const { data: transcript, error } = await supabase
    .from("transcripts")
    .select("text_plain, text_srt, text_md, detected_language, duration_seconds")
    .eq("job_id", id)
    .single()

  if (error || !transcript) {
    return NextResponse.json({ error: "Transcripción no encontrada" }, { status: 404 })
  }

  return NextResponse.json(transcript)
}
