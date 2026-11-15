import { createClient, createServiceClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const format = searchParams.get("format")

  if (!format || !["txt", "srt", "md"].includes(format)) {
    return NextResponse.json({ error: "format debe ser txt, srt o md" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }

  // Verify job belongs to user (RLS)
  const { data: job } = await supabase.from("jobs").select("id, user_id").eq("id", id).single()
  if (!job) return NextResponse.json({ error: "Trabajo no encontrado" }, { status: 404 })

  const service = await createServiceClient()
  const path = `${user.id}/${id}/transcript.${format}`

  const { data, error } = await service.storage
    .from("results")
    .createSignedUrl(path, 3600) // 1 hour expiry

  if (error || !data) {
    return NextResponse.json({ error: "No se pudo generar la URL de descarga" }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}
