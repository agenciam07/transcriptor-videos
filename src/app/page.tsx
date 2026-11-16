import { createClient } from "@/lib/supabase/server"
import { AppContent } from "@/components/app-content"
import { LandingPage } from "@/components/landing-page"

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return <LandingPage />
  }

  return <AppContent />
}
