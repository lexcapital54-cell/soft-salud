import type { ReactNode } from 'react'
import { loginUrl } from './config'

/** Servidos bajo /assets/… (en el hosting la raíz bloquea .mp4/.svg con 403). */
const HERO_VIDEO = '/assets/media/habilisalud.mp4'
const HERO_POSTER = '/assets/media/hero-poster.jpg'
const ALLY_POSTER = '/assets/media/ally-poster.jpg'

const WHATSAPP =
  'https://wa.me/573177000568?text=Hola%20HABILISALUD%2C%20quiero%20información%20sobre%20habilitación%20e%20interoperabilidad'
const EMAIL = 'mailto:dankojimenez@habilisalud.com'
const EMAIL_SERVICIO = 'mailto:servicioalcliente@habilisalud.com'

const navLinks = [
  { href: '#inicio', label: 'Inicio' },
  { href: '#nosotros', label: 'Nosotros' },
  { href: '#servicios', label: 'Servicios' },
  { href: '#normatividad', label: 'Normatividad' },
  { href: '#proceso', label: 'Recursos' },
  { href: '#contacto', label: 'Contacto' },
]

const checks = [
  'Alineación con Resolución 3100 de 2019 y 1732 de 2026',
  'Gestión documental y evidencias para habilitación / REPS',
  'HCE interoperable y acompañamiento RDA',
]

const whyUs = [
  {
    title: 'Equipo experto',
    body: 'Especialistas en habilitación y calidad en salud.',
    icon: (
      <path
        d="M9 11a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm6 1.5a2 2 0 100-4 2 2 0 000 4zM4.5 18c.4-2.4 2.4-4 4.5-4h1c2.1 0 4.1 1.6 4.5 4M14 14.5c1.5 0 3 .9 3.5 2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    ),
  },
  {
    title: 'Documentación lista',
    body: 'Expediente, SG-SST y evidencias organizadas.',
    icon: (
      <path
        d="M6 4.5h7l3.5 3.5V19.5H6V4.5zm7 0v3.5h3.5M9 11h6M9 14.5h6"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    ),
  },
  {
    title: 'Cumplimiento',
    body: 'Enfoque en calidad, seguridad y trazabilidad.',
    icon: (
      <path
        d="M12 3.5l7 3v5.2c0 4.3-2.9 7.3-7 8.8-4.1-1.5-7-4.5-7-8.8V6.5l7-3zm-2.2 9.2l1.7 1.7 3.8-3.8"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    ),
  },
  {
    title: 'Respuesta ágil',
    body: 'Acompañamiento cercano en cada etapa del proceso.',
    icon: (
      <path
        d="M12 7v5l3 2M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    ),
  },
  {
    title: 'Resultados',
    body: 'Consultorios listos para operar con tranquilidad.',
    icon: (
      <path
        d="M4 16l4-4 3 3 7-8M4 20h16"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
]

const services = [
  {
    title: 'Estándares de calidad',
    body: 'Evaluación frente a los estándares vigentes de habilitación.',
    icon: 'M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.9 7.2 18l.9-5.4L4.2 8.7l5.4-.8L12 3z',
  },
  {
    title: 'Gestión documental',
    body: 'Preparación y organización de requisitos obligatorios.',
    icon: 'M6 4.5h7l3.5 3.5V19.5H6V4.5zm7 0v3.5h3.5M9 11h6M9 14.5h6',
  },
  {
    title: 'REPS e inscripción',
    body: 'Registro, autoevaluación y renovación oportuna ante el REPS.',
    icon: 'M8 5.5h8v13H8V5.5zm2.5 3h3M10.5 12h3M10.5 15.5H13',
  },
  {
    title: 'HCE + RDA',
    body: 'Historias clínicas interoperables alineadas a RDA.',
    icon: 'M5 9.5c0-3 2.7-5 7-5s7 2 7 5-2.7 5-7 5c-.7 0-1.4-.1-2-.2L5 17v-4.2C4.4 11.8 5 10.7 5 9.5z',
  },
  {
    title: 'Acompañamiento',
    body: 'Asesoría experta para que usted se concentre en sus pacientes.',
    icon: 'M9 11a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm6 1.5a2 2 0 100-4 2 2 0 000 4zM4.5 18c.4-2.4 2.4-4 4.5-4h1c2.1 0 4.1 1.6 4.5 4',
  },
]

const stats = [
  { value: '+150', label: 'Instituciones asesoradas' },
  { value: '98%', label: 'Éxito en procesos' },
  { value: '+10', label: 'Años de experiencia' },
]

function CrossMark() {
  return (
    <span className="inline-flex size-8 items-center justify-center rounded-lg bg-navy text-white">
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
        <path d="M11 4h2v16h-2V4zm-7 7h16v2H4v-2z" fill="currentColor" />
      </svg>
    </span>
  )
}

function PrimaryButton({
  href,
  children,
  className = '',
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  const external =
    href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('https://wa.me')
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-navy px-6 py-3.5 text-[15px] font-semibold text-white transition hover:bg-navy-deep ${className}`}
    >
      {children}
    </a>
  )
}

function GhostButton({
  href,
  children,
  className = '',
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  const external =
    href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('https://wa.me')
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl border border-navy/20 bg-paper px-6 py-3.5 text-[15px] font-semibold text-navy transition hover:border-teal hover:text-teal-dark ${className}`}
    >
      {children}
    </a>
  )
}

export default function App() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-paper text-ink">
      <header className="sticky top-0 z-50 border-b border-line/80 bg-paper/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-5 py-3.5">
          <a href="#inicio" className="flex shrink-0 items-center gap-2.5">
            <CrossMark />
            <span className="text-[17px] font-bold tracking-[-0.03em] text-navy">HABILISALUD</span>
          </a>

          <nav className="ml-4 hidden flex-1 items-center justify-center gap-6 text-[14px] font-semibold text-ink/80 lg:flex">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="transition hover:text-teal-dark">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <a
              href={loginUrl('profesional')}
              className="hidden rounded-xl border border-navy/15 px-3 py-2 text-[12px] font-semibold text-navy transition hover:border-teal hover:text-teal-dark sm:inline-flex sm:text-[13px]"
            >
              Ingreso profesional
            </a>
            <a
              href={loginUrl('admin')}
              className="inline-flex rounded-xl bg-navy px-3.5 py-2 text-[12px] font-semibold text-white transition hover:bg-navy-deep sm:px-4 sm:text-[13px]"
            >
              Iniciar sesión
            </a>
            <a
              href="#contacto"
              className="hidden rounded-xl bg-navy px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-navy-deep md:inline-flex"
            >
              Cotiza tu servicio
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section id="inicio" className="relative overflow-hidden bg-soft">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,rgba(46,196,182,0.12),transparent_45%),radial-gradient(ellipse_at_80%_0%,rgba(0,43,92,0.08),transparent_40%)]" />
          <div className="relative mx-auto grid max-w-[1180px] items-center gap-10 px-5 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:py-20">
            <div>
              <p className="animate-fade-up text-[13px] font-bold tracking-[0.14em] text-teal-dark uppercase">
                Habilitación de servicios de salud
              </p>
              <h1 className="animate-fade-up delay-1 mt-4 text-[clamp(34px,5.2vw,56px)] leading-[1.08] font-bold tracking-[-0.035em] text-navy">
                Expertos en habilitación de servicios de salud
              </h1>
              <p className="animate-fade-up delay-2 mt-5 max-w-[42ch] text-[17px] leading-[1.5] text-muted">
                Acompañamos a consultorios e instituciones en calidad, seguridad del paciente y
                cumplimiento normativo, con documentación y sistemas listos para operar.
              </p>

              <ul className="animate-fade-up delay-3 mt-7 space-y-3">
                {checks.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[15px] text-ink">
                    <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok">
                      <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden>
                        <path
                          d="M5 12.5l4.2 4.2L19 7"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="animate-fade-up delay-4 mt-9 flex flex-wrap gap-3">
                <PrimaryButton href="#servicios">
                  Conoce nuestros servicios
                  <span aria-hidden>→</span>
                </PrimaryButton>
                <GhostButton href={WHATSAPP}>
                  <svg viewBox="0 0 24 24" className="size-4 text-ok" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M12.04 2C6.58 2 2.15 6.4 2.15 11.82c0 1.96.52 3.8 1.44 5.4L2 22l4.95-1.55a9.9 9.9 0 004.99 1.35h.01c5.46 0 9.89-4.4 9.89-9.82S17.5 2 12.04 2zm5.76 14.05c-.24.67-1.38 1.23-1.92 1.31-.5.07-1.13.1-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.26-4.79-4.2-4.93-4.39-.14-.19-1.16-1.54-1.16-2.94 0-1.4.73-2.09.99-2.38.26-.28.57-.35.76-.35h.55c.17 0 .41-.07.64.49.24.58.81 2 .88 2.14.07.14.12.31.02.5-.1.19-.14.31-.28.48-.14.17-.3.38-.42.51-.14.14-.28.29-.12.57.16.28.71 1.17 1.53 1.9 1.05.93 1.94 1.22 2.22 1.36.28.14.44.12.61-.07.17-.19.71-.82.9-1.1.19-.28.38-.23.64-.14.26.1 1.67.79 1.95.93.28.14.47.21.54.33.07.12.07.69-.17 1.36z"
                    />
                  </svg>
                  Habla con un asesor
                </GhostButton>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={loginUrl('profesional')}
                  className="text-[14px] font-semibold text-teal-dark underline-offset-4 hover:underline"
                >
                  Ingreso del profesional en salud →
                </a>
                <span className="text-line">|</span>
                <a
                  href={loginUrl('admin')}
                  className="text-[14px] font-semibold text-navy underline-offset-4 hover:underline"
                >
                  Iniciar sesión (admin) →
                </a>
              </div>
            </div>

            <div className="animate-slide-in delay-2 relative">
              <div className="relative overflow-hidden rounded-[28px] shadow-[var(--shadow-float)]">
                <img
                  src={HERO_POSTER}
                  alt=""
                  className="absolute inset-0 aspect-[4/5] h-full w-full object-cover sm:aspect-[5/6]"
                  aria-hidden
                />
                <video
                  className="relative aspect-[4/5] h-full w-full object-cover sm:aspect-[5/6]"
                  src={HERO_VIDEO}
                  poster={HERO_POSTER}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-label="Consultorio HABILISALUD"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy/35 via-transparent to-transparent" />
              </div>
              <div className="absolute bottom-6 left-4 right-4 rounded-2xl bg-paper/95 p-4 shadow-[var(--shadow-card)] backdrop-blur sm:left-6 sm:right-auto sm:max-w-[260px]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-10 items-center justify-center rounded-full bg-ok/15 text-ok">
                    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
                      <path
                        d="M12 3.5l7 3v5.2c0 4.3-2.9 7.3-7 8.8-4.1-1.5-7-4.5-7-8.8V6.5l7-3z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                      />
                    </svg>
                  </span>
                  <div>
                    <p className="text-[14px] font-bold text-navy">Excelencia en salud</p>
                    <p className="text-[12px] text-muted">Calidad · Seguridad · Confianza</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why us */}
        <section id="nosotros" className="px-5 py-10">
          <div className="mx-auto max-w-[1180px] rounded-[28px] bg-navy px-6 py-10 text-white sm:px-10 sm:py-12">
            <h2 className="text-center text-[clamp(24px,3vw,32px)] font-bold tracking-[-0.02em]">
              ¿Por qué elegir HABILISALUD?
            </h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
              {whyUs.map((item) => (
                <div key={item.title} className="text-center">
                  <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-white/10 text-teal">
                    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
                      {item.icon}
                    </svg>
                  </div>
                  <h3 className="text-[15px] font-bold">{item.title}</h3>
                  <p className="mt-2 text-[13px] leading-[1.45] text-white/70">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Services */}
        <section id="servicios" className="mx-auto max-w-[1180px] px-5 py-16">
          <div className="text-center">
            <h2 className="text-[clamp(28px,4vw,40px)] font-bold tracking-[-0.03em] text-navy">
              Nuestros servicios
            </h2>
            <div className="mx-auto mt-3 h-1 w-14 rounded-full bg-teal" />
            <p className="mx-auto mt-5 max-w-[44ch] text-[16px] text-muted">
              Del diagnóstico documental a la interoperabilidad: un solo acompañamiento.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {services.map((s) => (
              <article
                key={s.title}
                className="rounded-3xl border border-line bg-paper p-6 shadow-[var(--shadow-card)] transition hover:-translate-y-1"
              >
                <div className="flex size-12 items-center justify-center rounded-full bg-soft text-navy">
                  <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
                    <path
                      d={s.icon}
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h3 className="mt-5 text-[17px] font-bold tracking-[-0.02em] text-navy">{s.title}</h3>
                <p className="mt-3 text-[14px] leading-[1.45] text-muted">{s.body}</p>
                <a href="#contacto" className="mt-5 inline-flex text-[14px] font-semibold text-teal-dark">
                  Saber más →
                </a>
              </article>
            ))}
          </div>
        </section>

        {/* Normatividad + ally */}
        <section id="normatividad" className="bg-soft px-5 py-16">
          <div className="mx-auto grid max-w-[1180px] overflow-hidden rounded-[28px] lg:grid-cols-2">
            <div className="relative min-h-[280px]">
              <img
                src={ALLY_POSTER}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                aria-hidden
              />
              <video
                className="absolute inset-0 h-full w-full object-cover"
                src={HERO_VIDEO}
                poster={ALLY_POSTER}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-hidden
              />
              <div className="absolute inset-0 bg-navy/25" />
            </div>
            <div className="bg-navy px-8 py-12 text-white sm:px-12">
              <h2 className="text-[clamp(26px,3.5vw,36px)] font-bold tracking-[-0.03em]">
                Tu aliado estratégico en salud
              </h2>
              <p className="mt-5 max-w-[40ch] text-[15px] leading-[1.55] text-white/75">
                Preparamos su consultorio para habilitación, renovación REPS e interoperabilidad,
                con procesos claros y acompañamiento cercano.
              </p>
              <div className="mt-10 grid grid-cols-3 gap-4">
                {stats.map((s) => (
                  <div key={s.label}>
                    <p className="text-[28px] font-bold tracking-[-0.03em] text-teal">{s.value}</p>
                    <p className="mt-1 text-[12px] leading-[1.35] text-white/65">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Process */}
        <section id="proceso" className="mx-auto max-w-[1180px] px-5 py-16">
          <h2 className="text-center text-[clamp(28px,4vw,40px)] font-bold tracking-[-0.03em] text-navy">
            Cómo trabajamos
          </h2>
          <div className="mx-auto mt-3 h-1 w-14 rounded-full bg-teal" />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: '01', title: 'Diagnóstico', body: 'Revisamos su situación frente a la normativa vigente.' },
              { n: '02', title: 'Documentación', body: 'Preparamos requisitos, evidencias y flujos.' },
              { n: '03', title: 'Interoperabilidad', body: 'Alineamos HCE e intercambio de datos.' },
              { n: '04', title: 'Habilitación', body: 'Acompañamos inscripción, REPS y cierre de brechas.' },
            ].map((step) => (
              <article key={step.n} className="rounded-3xl border border-line bg-paper p-6">
                <p className="text-[13px] font-bold tracking-[0.12em] text-teal-dark">{step.n}</p>
                <h3 className="mt-3 text-[18px] font-bold text-navy">{step.title}</h3>
                <p className="mt-2 text-[14px] leading-[1.45] text-muted">{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Contact strip */}
        <section id="contacto" className="px-5 pb-20">
          <div className="mx-auto flex max-w-[1180px] flex-col items-stretch gap-4 rounded-[28px] border border-line bg-paper p-5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-6">
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 text-[14px] font-semibold text-navy transition hover:text-teal-dark"
            >
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-ok/15 text-ok">
                <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M12.04 2C6.58 2 2.15 6.4 2.15 11.82c0 1.96.52 3.8 1.44 5.4L2 22l4.95-1.55a9.9 9.9 0 004.99 1.35h.01c5.46 0 9.89-4.4 9.89-9.82S17.5 2 12.04 2z"
                  />
                </svg>
              </span>
              ¿Tienes dudas? Escríbenos por WhatsApp
            </a>
            <a
              href={EMAIL}
              className="flex items-center gap-3 text-[14px] font-semibold text-navy transition hover:text-teal-dark"
            >
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-soft text-navy">
                @
              </span>
              dankojimenez@habilisalud.com
            </a>
            <PrimaryButton href={WHATSAPP} className="sm:shrink-0">
              Contáctanos
            </PrimaryButton>
          </div>
          <p className="mx-auto mt-4 max-w-[1180px] px-1 text-center text-[13px] text-muted sm:text-left">
            También: <a href={EMAIL_SERVICIO} className="font-semibold text-navy">servicioalcliente@habilisalud.com</a>
            {' · '}Danko Jimenez Londoño · 317 700 0568
          </p>
        </section>
      </main>

      <footer className="border-t border-line bg-soft px-5 py-10">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <CrossMark />
            <span className="font-bold text-navy">HABILISALUD</span>
          </div>
          <p className="text-[13px] text-muted">
            Expertos en habilitación de consultorios · Colombia
          </p>
          <div className="flex gap-4 text-[13px] font-semibold">
            <a href={loginUrl('profesional')} className="text-navy hover:text-teal-dark">
              Profesional
            </a>
            <a href={loginUrl('admin')} className="text-navy hover:text-teal-dark">
              Admin
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
