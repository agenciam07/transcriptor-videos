export const instant = false

import { Suspense } from "react"
import { JobResultClient } from "./job-result-client"

export default async function JobResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-sm text-muted-foreground">Cargando...</p></div>}>
      <JobResultClient id={id} />
    </Suspense>
  )
}
