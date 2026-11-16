"use client"

import { useState } from "react"
import { Header } from "@/components/header"
import { SubmitForm } from "@/components/submit-form"
import { JobsList } from "@/components/jobs-list"

export function AppContent() {
  const [refresh, setRefresh] = useState(0)

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h1 className="text-base font-semibold text-slate-900 mb-4">Nueva transcripción</h1>
          <SubmitForm onJobCreated={() => setRefresh((r) => r + 1)} />
        </div>

        <section>
          <h2 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">
            Trabajos recientes
          </h2>
          <JobsList refresh={refresh} />
        </section>
      </main>
    </div>
  )
}
