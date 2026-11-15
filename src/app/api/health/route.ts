import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createServiceClient()
    const { error } = await supabase.from('jobs').select('id').limit(1)
    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ ok: true, supabase: false, error: error.message })
    }
    return NextResponse.json({ ok: true, supabase: true })
  } catch (err) {
    return NextResponse.json({
      ok: true,
      supabase: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}
