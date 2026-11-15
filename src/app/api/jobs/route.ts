import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isValidVideoUrl } from '@/lib/validators'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100)
  const cursor = searchParams.get('cursor')
  const q = searchParams.get('q')?.trim()

  // Use service client for the join with transcripts (RLS on transcripts also filters by user_id)
  const svc = await createServiceClient()

  let query = svc
    .from('jobs')
    .select('*, transcripts(id, text_plain, detected_language, duration_seconds)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  if (q) {
    // Filter to jobs that have a transcript matching the search term
    query = query.ilike('transcripts.text_plain', `%${q}%`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // If searching, filter out jobs with no matching transcript
  const filtered = q
    ? (data as Array<Record<string, unknown>>).filter((j) => {
        const t = j.transcripts as Array<{ text_plain: string }> | null
        return t && t.length > 0
      })
    : data as Array<Record<string, unknown>>

  // Add preview (first 200 chars of text_plain)
  type TranscriptRow = { id: string; text_plain: string; detected_language: string; duration_seconds: number }
  const jobs = filtered.slice(0, limit).map((j) => {
    const transcripts = j.transcripts as TranscriptRow[] | null
    const transcript = transcripts?.[0] ?? null
    const { transcripts: _t, ...rest } = j
    void _t
    return {
      ...rest,
      transcript_preview: transcript ? transcript.text_plain.slice(0, 200) : null,
      detected_language: transcript?.detected_language ?? null,
      duration_seconds: transcript?.duration_seconds ?? null,
    }
  })

  const hasMore = filtered.length > limit
  const nextCursor = hasMore ? (jobs[jobs.length - 1] as Record<string, unknown>).created_at as string : null

  return NextResponse.json({ jobs, nextCursor })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  let body: { type: string; url?: string; storagePath?: string; jobId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  if (body.type === 'link') {
    if (!body.url) {
      return NextResponse.json({ error: 'Se requiere el campo url' }, { status: 400 })
    }
    if (!isValidVideoUrl(body.url)) {
      return NextResponse.json(
        { error: 'URL no válida. Solo se aceptan links de TikTok, Instagram, Facebook o YouTube.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('jobs')
      .insert({ source_type: 'link', source_url: body.url, user_id: user.id })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  if (body.type === 'upload') {
    if (!body.storagePath) {
      return NextResponse.json({ error: 'Se requiere el campo storagePath' }, { status: 400 })
    }

    const insertData: Record<string, string> = {
      source_type: 'upload',
      source_url: body.storagePath,
      user_id: user.id,
    }
    if (body.jobId) insertData.id = body.jobId

    const { data, error } = await supabase
      .from('jobs')
      .insert(insertData)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  return NextResponse.json({ error: 'type debe ser "link" o "upload"' }, { status: 400 })
}
