import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { sanitizeFilename } from '@/lib/validators'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  let filename: string
  let contentType: string
  try {
    const body = await request.json()
    filename = body.filename
    contentType = body.contentType
    if (typeof filename !== 'string' || !filename || typeof contentType !== 'string' || !contentType) {
      throw new Error('missing fields')
    }
  } catch {
    return NextResponse.json({ error: 'Se requiere filename y contentType' }, { status: 400 })
  }

  const jobId = randomUUID()
  const path = `${user.id}/${jobId}/${sanitizeFilename(filename)}`

  const service = await createServiceClient()
  const { data, error } = await service.storage
    .from('media')
    .createSignedUploadUrl(path)

  if (error || !data) {
    console.error('POST /api/upload-url', error)
    return NextResponse.json({ error: 'Error generando URL de subida' }, { status: 500 })
  }

  return NextResponse.json({ uploadUrl: data.signedUrl, path, jobId })
}
