import type { ReactNode } from 'react'

const WHATSAPP =
  'https://wa.me/573177000568?text=Hola%20HABILISALUD%2C%20quiero%20información%20sobre%20habilitación%20e%20interoperabilidad'
const EMAIL = 'mailto:dankojimenez@habilisalud.com'
const EMAIL_SERVICIO = 'mailto:servicioalcliente@habilisalud.com'

const services = [
  {
    title: 'Estándares de calidad',
    body: 'Evaluación frente a los nuevos estándares de la Resolución 1732 de 2026.',
    icon: (
      <path
        d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.9 7.2 18l.9-5.4L4.2 8.7l5.4-.8L12 3z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: 'Gestión documental',
    body: 'Preparación y organización de requisitos obligatorios para habilitación.',
    icon: (
      <path
        d="M6 4.5h7l3.5 3.5V19.5H6V4.5zm7 0v3.5h3.5M9 11h6M9 14.5h6"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: 'REPS e inscripción',
    body: 'Registro, autoevaluación y renovación oportuna ante el REPS.',
    icon: (
      <path
        d="M8 5.5h8v13H8V5.5zm2.5 3h3M10.5 12h3M10.5 15.5H13"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: 'HCE + RDA',
    body: 'Historias clínicas electrónicas interoperables alineadas a lineamientos de información en salud y RDA.',
    icon: (
      <path
        d="M5 9.5c0-3 2.7-5 7-5s7 2 7 5-2.7 5-7 5c-.7 0-1.4-.1-2-.2L5 17v-4.2C4.4 11.8 5 10.7 5 9.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: 'Cumplimiento operativo',
    body: 'Identificación de brechas y plan de acciones para cerrar riesgos sanitarios y legales.',
    icon: (
      <path
        d="M12 3.5l7 3v5.2c0 4.3-2.9 7.3-7 8.8-4.1-1.5-7-4.5-7-8.8V6.5l7-3zm-2.2 9.2l1.7 1.7 3.8-3.8"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: 'Acompañamiento',
    body: 'Asesoría experta en cada etapa para que usted se concentre en sus pacientes.',
    icon: (
      <path
        d="M9 11a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm6 1.5a2 2 0 100-4 2 2 0 000 4zM4.5 18c.4-2.4 2.4-4 4.5-4h1c2.1 0 4.1 1.6 4.5 4M14 14.5c1.5 0 3 .9 3.5 2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
]

const benefits = [
  {
    title: 'Cumplimiento normativo',
    body: 'Alineación con la Resolución 1732 de 2026 y requisitos de interoperabilidad.',
  },
  {
    title: 'Protección de datos',
    body: 'Manejo seguro y confidencial de información clínica y del consultorio.',
  },
  {
    title: 'Soporte experto',
    body: 'Equipo especializado en habilitación, REPS, HCE y RDA.',
  },
  {
    title: 'Eficiencia y tranquilidad',
    body: 'Nosotros asumimos la burocracia; usted atiende a sus pacientes.',
  },
]

const steps = [
  { n: '01', title: 'Diagnóstico', body: 'Revisamos su situación actual frente a la Res. 1732 y RDA.' },
  { n: '02', title: 'Documentación', body: 'Preparamos requisitos, evidencias y flujos de información.' },
  { n: '03', title: 'Interoperabilidad', body: 'Alineamos HCE e intercambio de datos según lineamientos vigentes.' },
  { n: '04', title: 'Habilitación', body: 'Acompañamos inscripción, renovación REPS y cierre de brechas.' },
]

function IconTile({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex size-[88px] items-center justify-center rounded-[45px] bg-paper shadow-[var(--shadow-card)] sm:size-[120px]">
      <svg viewBox="0 0 24 24" className="size-8 text-ink sm:size-10" aria-hidden>
        {children}
      </svg>
    </div>
  )
}

function OutlineButton({
  href,
  children,
  className = '',
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  const opensExternally =
    href.startsWith('https://wa.me') || href.startsWith('mailto:') || href.startsWith('https://')

  return (
    <a
      href={href}
      target={opensExternally ? '_blank' : undefined}
      rel={opensExternally ? 'noreferrer' : undefined}
      className={`inline-flex items-center justify-center rounded-[30px] border border-ink bg-paper px-[22px] py-4 text-[16px] tracking-[-0.012em] text-ink transition hover:bg-vellum ${className}`}
    >
      {children}
    </a>
  )
}

export default function App() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-paper text-ink">
      {/* Nav + acceso admin fuera del menú */}
      <header className="animate-nav-in fixed inset-x-0 top-0 z-50 px-4 pt-5">
        <div className="mx-auto flex w-full max-w-[1200px] items-center gap-3">
          <nav className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[52px] bg-paper/95 px-[22px] py-4 shadow-[var(--shadow-nav)] backdrop-blur-md">
            <a href="#inicio" className="shrink-0 text-[18px] tracking-[-0.017em] text-graphite sm:text-[20px]">
              HABILISALUD
            </a>
            <div className="hidden items-center gap-8 text-[15px] text-graphite md:flex">
              <a href="#servicios" className="transition hover:text-brand">
                Servicios
              </a>
              <a href="#hce-rda" className="transition hover:text-brand">
                HCE + RDA
              </a>
              <a href="#proceso" className="transition hover:text-brand">
                Proceso
              </a>
              <a href="#contacto" className="transition hover:text-brand">
                Contacto
              </a>
            </div>
            <a
              href="http://localhost:4200/login?tipo=profesional"
              className="inline-flex shrink-0 items-center justify-center rounded-[30px] border border-teal-dark bg-teal-dark px-3 py-2.5 text-center text-[12px] leading-tight tracking-[-0.012em] text-white transition hover:bg-[#002a34] sm:px-[18px] sm:text-[14px]"
            >
              Ingreso del profesional en salud
            </a>
          </nav>

          <a
            href="http://localhost:4200/login?tipo=admin"
            className="inline-flex shrink-0 items-center justify-center rounded-[30px] border border-ink bg-paper/95 px-4 py-2.5 text-[13px] tracking-[-0.012em] text-ink shadow-[var(--shadow-nav)] backdrop-blur-md transition hover:bg-vellum sm:px-5 sm:text-[14px]"
          >
            Iniciar sesión
          </a>
        </div>
      </header>

      <main>
        {/* Hero — one composition */}
        <section id="inicio" className="relative min-h-[100svh] overflow-hidden">
          <div className="absolute inset-0">
            <video
              className="h-full w-full object-cover"
              src="/habilisalud.mp4"
              autoPlay
              muted
              loop
              playsInline
              aria-label="Consultorio HABILISALUD"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-paper via-paper/55 to-paper/25" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(255,255,255,0.35)_70%,rgba(255,255,255,0.85)_100%)]" />
          </div>

          <div className="relative mx-auto flex min-h-[100svh] max-w-[1200px] flex-col justify-end px-6 pb-16 pt-36 sm:pb-24 sm:pt-40">
            <p className="animate-fade-up text-[14px] tracking-[0.12em] text-graphite uppercase sm:text-[15px]">
              Expertos en habilitación de consultorios
            </p>
            <h1 className="animate-fade-up delay-1 mt-5 max-w-[18ch] text-[clamp(48px,11vw,120px)] leading-[0.98] font-normal tracking-[-0.04em] text-brand">
              HABILISALUD
            </h1>
            <p className="animate-fade-up delay-2 mt-6 max-w-[36ch] text-[18px] leading-[1.35] tracking-[-0.012em] text-graphite sm:text-[20px]">
              Documentación, historia clínica electrónica e interoperabilidad bajo la Resolución 1732 de 2026 y RDA.
            </p>
            <div className="animate-fade-up delay-3 mt-10 flex flex-wrap gap-3">
              <OutlineButton href={WHATSAPP}>Solicitar diagnóstico</OutlineButton>
              <a
                href="http://localhost:4200/login?tipo=profesional"
                className="inline-flex items-center justify-center rounded-[30px] border border-teal-dark bg-teal-dark px-[22px] py-4 text-[16px] tracking-[-0.012em] text-white transition hover:bg-[#002a34]"
              >
                Ingreso del profesional en salud
              </a>
            </div>
            <p className="animate-fade-in delay-4 mt-10 text-[14px] tracking-[0.08em] text-stone uppercase">
              Calidad · Seguridad · Confianza
            </p>
          </div>
        </section>

        {/* Normativa */}
        <section className="mx-auto max-w-[1200px] px-6 py-[90px] text-center">
          <IconTile>
            <path
              d="M12 3.5l7 3v5.2c0 4.3-2.9 7.3-7 8.8-4.1-1.5-7-4.5-7-8.8V6.5l7-3zm-2 9.3l1.6 1.6 3.6-3.6"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </IconTile>
          <h2 className="mt-10 text-[clamp(32px,5vw,44px)] leading-[1.15] tracking-[-0.017em] text-ink">
            Nueva Resolución 1732 de 2026
          </h2>
          <p className="mx-auto mt-8 max-w-[42ch] text-[18px] leading-[1.4] text-stone">
            Reemplaza la Resolución 3100 de 2019. Actualícese, cumpla y evite riesgos sanitarios y legales en su
            consultorio.
          </p>
        </section>

        {/* HCE + RDA — featured */}
        <section id="hce-rda" className="mx-auto max-w-[1200px] px-6 pb-[90px]">
          <div className="rounded-[45px] bg-paper px-8 py-14 shadow-[var(--shadow-feature)] sm:px-14 sm:py-16">
            <p className="text-center text-[14px] tracking-[0.1em] text-brand uppercase">Servicio clave</p>
            <h2 className="mt-4 text-center text-[clamp(32px,6vw,64px)] leading-[1.08] tracking-[-0.025em] text-ink">
              Historias clínicas
              <br />
              <span className="text-brand">interoperables + RDA</span>
            </h2>
            <p className="mx-auto mt-8 max-w-[48ch] text-center text-[18px] leading-[1.4] text-stone">
              Acompañamos la adopción de HCE con interoperabilidad y el cumplimiento de lineamientos de información en
              salud, para que su consultorio opere con datos seguros, trazables y listos para RDA.
            </p>
            <ul className="mx-auto mt-12 grid max-w-[900px] gap-5 sm:grid-cols-3">
              {[
                'Intercambio de información clínica conforme a lineamientos vigentes',
                'Documentación y evidencias para habilitación y auditoría',
                'Procesos ágiles orientados a REPS y continuidad de la atención',
              ].map((item) => (
                <li
                  key={item}
                  className="rounded-[30px] border border-linen px-6 py-7 text-[16px] leading-[1.4] text-graphite"
                >
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-12 flex justify-center">
              <OutlineButton href={WHATSAPP}>Quiero cumplir con HCE + RDA</OutlineButton>
            </div>
          </div>
        </section>

        {/* Servicios */}
        <section id="servicios" className="mx-auto max-w-[1200px] px-6 pb-[90px]">
          <h2 className="text-center text-[clamp(32px,5vw,44px)] leading-[1.15] tracking-[-0.017em] text-ink">
            Servicios integrales
          </h2>
          <p className="mx-auto mt-5 max-w-[40ch] text-center text-[18px] text-stone">
            Del diagnóstico documental a la interoperabilidad: un solo acompañamiento.
          </p>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <article
                key={s.title}
                className="rounded-[30px] bg-paper p-8 shadow-[var(--shadow-card)] transition duration-500 hover:-translate-y-1"
              >
                <div className="flex size-14 items-center justify-center rounded-[20px] border border-linen">
                  <svg viewBox="0 0 24 24" className="size-7 text-ink" aria-hidden>
                    {s.icon}
                  </svg>
                </div>
                <h3 className="mt-7 text-[24px] leading-[1.2] tracking-[-0.017em] text-ink">{s.title}</h3>
                <p className="mt-4 text-[16px] leading-[1.4] text-stone">{s.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Beneficios */}
        <section className="mx-auto max-w-[1200px] px-6 pb-[90px]">
          <h2 className="text-center text-[clamp(32px,5vw,44px)] leading-[1.15] tracking-[-0.017em] text-ink">
            Beneficios de trabajar con HABILISALUD
          </h2>
          <div className="mt-14 grid gap-8 md:grid-cols-2">
            {benefits.map((b, i) => (
              <div key={b.title} className="flex gap-5 border-t border-vellum pt-8">
                <span className="text-[14px] tracking-[-0.012em] text-brand">0{i + 1}</span>
                <div>
                  <h3 className="text-[24px] tracking-[-0.017em] text-graphite">{b.title}</h3>
                  <p className="mt-3 text-[16px] leading-[1.4] text-stone">{b.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Proceso */}
        <section id="proceso" className="mx-auto max-w-[1200px] px-6 pb-[90px]">
          <h2 className="text-center text-[clamp(32px,5vw,44px)] leading-[1.15] tracking-[-0.017em] text-ink">
            Cómo trabajamos
          </h2>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <article key={step.n} className="rounded-[30px] border border-linen p-7">
                <p className="text-[14px] tracking-[0.08em] text-brand">{step.n}</p>
                <h3 className="mt-4 text-[24px] tracking-[-0.017em] text-ink">{step.title}</h3>
                <p className="mt-3 text-[16px] leading-[1.4] text-stone">{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* CTA + contacto */}
        <section id="contacto" className="mx-auto max-w-[1200px] px-6 pb-[100px]">
          <div className="rounded-[45px] bg-paper px-8 py-16 text-center shadow-[var(--shadow-feature)] sm:px-14">
            <h2 className="text-[clamp(28px,5vw,48px)] leading-[1.12] tracking-[-0.02em] text-ink">
              Con la Resolución 1732 de 2026,
              <br />
              <span className="text-brand">su consultorio cumple</span>
            </h2>
            <p className="mx-auto mt-6 max-w-[36ch] text-[18px] text-stone">
              Su paciente está seguro. Respuesta ágil y eficiente.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <OutlineButton href={WHATSAPP}>WhatsApp 317 700 0568</OutlineButton>
              <OutlineButton href={EMAIL}>dankojimenez@habilisalud.com</OutlineButton>
              <OutlineButton href={EMAIL_SERVICIO}>servicioalcliente@habilisalud.com</OutlineButton>
            </div>
            <p className="mt-10 text-[16px] text-graphite">Danko Jimenez Londoño</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-vellum px-6 py-16">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <p className="text-[16px] tracking-[-0.012em] text-ink">HABILISALUD</p>
          <p className="text-[14px] text-stone">Expertos en habilitación de consultorios · Colombia</p>
        </div>
      </footer>
    </div>
  )
}
