import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isValidVideoUrl, isUuid } from '@/lib/validators'
import { NextResponse } from 'next/server'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const parsedLimit = Number.parseInt(searchParams.get('limit') ?? '', 10)
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, MAX_LIMIT)
    : DEFAULT_LIMIT
  const cursor = searchParams.get('cursor')
  const q = searchParams.get('q')?.trim()

  if (cursor && Number.isNaN(Date.parse(cursor))) {
    return NextResponse.json({ error: 'cursor inválido' }, { status: 400 })
  }

  // Con búsqueda se usa !inner para que el filtro sobre transcripts filtre los jobs
  // en la base de datos; así el límite y la paginación se aplican sobre los resultados reales.
  const transcriptsSelect = q
    ? 'transcripts!inner(id, text_plain, detected_language, duration_seconds)'
    : 'transcripts(id, text_plain, detected_language, duration_seconds)'

  // Cliente del usuario: RLS garantiza que solo ve sus jobs y transcripciones.
  let query = supabase
    .from('jobs')
    .select(`*, ${transcriptsSelect}`)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  if (q) {
    query = query.ilike('transcripts.text_plain', `%${q}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error('GET /api/jobs', error)
    return NextResponse.json({ error: 'No se pudieron cargar los trabajos' }, { status: 500 })
  }

  type TranscriptRow = { id: string; text_plain: string; detected_language: string; duration_seconds: number }
  const rows = data as Array<Record<string, unknown>>
  const jobs = rows.slice(0, limit).map((j) => {
    const transcripts = j.transcripts as TranscriptRow[] | TranscriptRow | null
    const transcript = Array.isArray(transcripts) ? transcripts[0] ?? null : transcripts
    const { transcripts: _t, ...rest } = j
    void _t
    return {
      ...rest,
      transcript_preview: transcript ? transcript.text_plain.slice(0, 200) : null,
      detected_language: transcript?.detected_language ?? null,
      duration_seconds: transcript?.duration_seconds ?? null,
    }
  })

  const hasMore = rows.length > limit
  const nextCursor = hasMore ? (jobs[jobs.length - 1] as Record<string, unknown>).created_at as string : null

  return NextResponse.json({ jobs, nextCursor })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  let body: { type?: unknown; url?: unknown; storagePath?: unknown; jobId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 })
  }

  // Los usuarios no tienen permiso de INSERT por RLS: el job lo crea el servidor
  // con service_role, solo después de validar la entrada.
  const service = await createServiceClient()

  if (body.type === 'link') {
    if (typeof body.url !== 'string' || !body.url) {
      return NextResponse.json({ error: 'Se requiere el campo url' }, { status: 400 })
    }
    if (!isValidVideoUrl(body.url)) {
      return NextResponse.json(
        { error: 'URL no válida. Solo se aceptan links de TikTok, Instagram, Facebook o YouTube.' },
        { status: 400 }
      )
    }

    const { data, error } = await service
      .from('jobs')
      .insert({ source_type: 'link', source_url: body.url, user_id: user.id })
      .select()
      .single()

    if (error) {
      console.error('POST /api/jobs link', error)
      return NextResponse.json({ error: 'No se pudo crear el trabajo' }, { status: 500 })
    }
    return NextResponse.json(data, { status: 201 })
  }

  if (body.type === 'upload') {
    if (typeof body.storagePath !== 'string' || !body.storagePath) {
      return NextResponse.json({ error: 'Se requiere el campo storagePath' }, { status: 400 })
    }

    // La ruta debe ser exactamente <user_id>/<job_id>/<archivo> del propio usuario,
    // tal como la genera /api/upload-url. Sin esto, un usuario podría apuntar al
    // archivo de otro y el worker (service_role) lo transcribiría.
    const parts = body.storagePath.split('/')
    const [ownerId, jobId, filename] = parts
    const validPath =
      parts.length === 3 &&
      ownerId === user.id &&
      isUuid(jobId) &&
      !!filename && filename !== '.' && filename !== '..'
    if (!validPath || (body.jobId !== undefined && body.jobId !== jobId)) {
      return NextResponse.json({ error: 'Ruta de archivo no válida' }, { status: 400 })
    }

    // Confirma que el archivo realmente se subió.
    const { data: files } = await service.storage
      .from('media')
      .list(`${ownerId}/${jobId}`, { search: filename })
    if (!files?.some((f) => f.name === filename)) {
      return NextResponse.json({ error: 'No se encontró el archivo subido' }, { status: 400 })
    }

    const { data, error } = await service
      .from('jobs')
      .insert({ id: jobId, source_type: 'upload', source_url: body.storagePath, user_id: user.id })
      .select()
      .single()

    if (error) {
      console.error('POST /api/jobs upload', error)
      const status = error.code === '23505' ? 409 : 500
      return NextResponse.json({ error: 'No se pudo crear el trabajo' }, { status })
    }
    return NextResponse.json(data, { status: 201 })
  }

  return NextResponse.json({ error: 'type debe ser "link" o "upload"' }, { status: 400 })
}
