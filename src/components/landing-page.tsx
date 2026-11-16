"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

const features = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5z"/>
        <path d="M20.5 10H19V8.5a4.5 4.5 0 0 0-9 0V10H8.5A.5.5 0 0 0 8 10.5V12a4 4 0 0 0 4 4h1a4 4 0 0 0 4-4v-1.5a.5.5 0 0 0-.5-.5z"/>
      </svg>
    ),
    color: "text-indigo-600 bg-indigo-50",
    title: "YouTube, TikTok, Instagram, Facebook",
    desc: "Pega el link del video y lo descargamos automáticamente. Sin límite de duración.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
    ),
    color: "text-teal-600 bg-teal-50",
    title: "Sube tu archivo",
    desc: "MP4, MKV, MOV, AVI, MP3, WAV, M4A y más de 20 formatos. Sube directamente desde tu dispositivo.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
    color: "text-blue-600 bg-blue-50",
    title: "60+ idiomas",
    desc: "Detecta automáticamente el idioma. Español, inglés, portugués, francés y muchos más.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
    color: "text-orange-600 bg-orange-50",
    title: "Exporta en 3 formatos",
    desc: "Descarga como .txt para texto limpio, .srt para subtítulos con tiempos, o .md para Markdown.",
  },
]

const steps = [
  {
    num: "1",
    title: "Pega un link o sube un archivo",
    desc: "Links de YouTube, TikTok, Instagram y Facebook, o sube cualquier archivo de video o audio.",
  },
  {
    num: "2",
    title: "Transcribimos con IA",
    desc: "Usamos Groq Whisper para transcribir con alta precisión. Un video de 10 minutos listo en segundos.",
  },
  {
    num: "3",
    title: "Exporta o copia el texto",
    desc: "Descarga en .txt, .srt o .md, o copia el texto directo. Tu historial queda guardado.",
  },
]

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-foreground">
      {/* Navbar */}
      <nav className="border-b border-border sticky top-0 bg-white/95 backdrop-blur z-20">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-4 h-4">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </div>
            <span className="font-semibold text-sm">Transcriptor de Videos</span>
          </div>
          <Button asChild size="sm">
            <Link href="/login">Iniciar sesión</Link>
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-20 pb-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs font-medium px-3 py-1.5 rounded-full mb-6 border border-indigo-100">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            Transcripción con Groq Whisper IA
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-tight mb-5">
            Transcribe video y audio<br />
            <span className="text-primary">a texto en segundos</span>
          </h1>

          <p className="text-lg text-slate-500 max-w-xl mx-auto mb-8 leading-relaxed">
            Pega un link de YouTube, TikTok, Instagram o Facebook, o sube tu archivo.
            Obtén la transcripción completa lista para exportar.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12">
            <Button asChild size="lg" className="text-base px-8 h-12">
              <Link href="/login">Empezar gratis</Link>
            </Button>
          </div>

          {/* Stats badges */}
          <div className="flex flex-wrap justify-center gap-3 text-sm text-slate-500">
            {[
              "20+ formatos de video y audio",
              "60+ idiomas detectados",
              "Exporta en txt · srt · md",
            ].map((s) => (
              <span key={s} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-primary flex-shrink-0">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 px-4 bg-slate-50 border-y border-slate-100">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-slate-900 mb-2">
            Cómo funciona
          </h2>
          <p className="text-center text-slate-500 mb-10">En 3 pasos simples</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {steps.map((s) => (
              <div key={s.num} className="bg-white rounded-xl border border-slate-200 p-6 relative">
                <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center mb-4">
                  {s.num}
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{s.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-slate-900 mb-2">
            Todo lo que necesitas
          </h2>
          <p className="text-center text-slate-500 mb-10">Sin complicaciones. Sin límites artificiales.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {features.map((f) => (
              <div key={f.title} className="flex gap-4 p-5 rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${f.color}`}>
                  {f.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm mb-1">{f.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto text-center bg-indigo-50 border border-indigo-100 rounded-2xl p-10">
          <h2 className="text-2xl font-bold text-slate-900 mb-3">
            Transcribe tu primer video gratis
          </h2>
          <p className="text-slate-500 mb-6">
            Sin tarjeta de crédito. Crea tu cuenta y empieza en segundos.
          </p>
          <Button asChild size="lg" className="text-base px-8 h-12">
            <Link href="/login">Crear cuenta gratis</Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" className="w-3 h-3">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
            </div>
            <span className="font-medium text-slate-600">Transcriptor de Videos</span>
          </div>
          <span>Impulsado por Groq Whisper IA</span>
        </div>
      </footer>
    </div>
  )
}
