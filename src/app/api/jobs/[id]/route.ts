import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Verify job belongs to this user (RLS also enforces this)
  const { data: job, error: fetchError } = await supabase
    .from('jobs')
    .select('id, user_id')
    .eq('id', id)
    .single()

  if (fetchError || !job) {
    return NextResponse.json({ error: 'Trabajo no encontrado' }, { status: 404 })
  }

  // Clean up Storage files
  const service = await createServiceClient()
  const prefix = `${user.id}/${id}/`

  for (const bucket of ['media', 'results'] as const) {
    const { data: files } = await service.storage.from(bucket).list(`${user.id}/${id}`)
    if (files && files.length > 0) {
      const paths = files.map((f) => `${prefix}${f.name}`)
      await service.storage.from(bucket).remove(paths)
    }
  }

  // Delete job (transcripts cascade-deleted by FK)
  const { error: deleteError } = await supabase
    .from('jobs')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: true })
}
