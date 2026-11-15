import { createClient } from '@/lib/supabase/server'
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

  let query = supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const hasMore = data.length > limit
  const jobs = hasMore ? data.slice(0, limit) : data
  const nextCursor = hasMore ? jobs[jobs.length - 1].created_at : null

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
