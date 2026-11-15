"use client"

import { useState } from "react"
import { Header } from "@/components/header"
import { SubmitForm } from "@/components/submit-form"
import { JobsList } from "@/components/jobs-list"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function HomePage() {
  const [refresh, setRefresh] = useState(0)

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Nueva transcripción</CardTitle>
          </CardHeader>
          <CardContent>
            <SubmitForm onJobCreated={() => setRefresh((r) => r + 1)} />
          </CardContent>
        </Card>

        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            Trabajos recientes
          </h2>
          <JobsList refresh={refresh} />
        </section>
      </main>
    </div>
  )
}
