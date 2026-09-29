import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MdCheck, MdChevronLeft, MdChevronRight, MdScience, MdOpenInNew } from 'react-icons/md'
import {
  DEMO_SCENARIOS, DEMO_SESSIONS, DEMO_LATENCIES, DEMO_USERNAME,
  getDemoConfig, enableDemoMode, disableDemoMode,
} from '../lib/demoMode'
import './DemoData.css'

const STEPS = ['Escenario', 'Sesión', 'Red', 'Revisar']

const LONG_USER = 'explorador_con_un_nombre_de_usuario_extremadamente_largo_sin_espacios_2026'

// Qué mirar en cada pantalla. `stressOnly` = el caso solo existe en "Estrés".
const CHECKS = [
  { to: '/inicio', title: 'Inicio', look: 'Accesos en una fila o columna según el ancho; actividad reciente con foto, avatar y lugar truncado.' },
  { to: '/observaciones', title: 'Observaciones', look: 'Cuadrícula, lista y mapa; filtro local; tarjetas sin foto o sin nombre común.' },
  { to: '/explorar', title: 'Explorar', look: 'Especies y observadores; conteos; nombres científicos largos.' },
  { to: '/explorer/demo-obs-001', title: 'Detalle de observación', look: 'Título, compartir, favorito, mapa, notas. En Estrés: lugar y notas muy largas.' },
  { to: '/explorer/demo-obs-002', title: 'Observación sin foto ni nombre común', look: 'Marcador de posición de imagen y título de respaldo.', stressOnly: true },
  { to: '/explorer/demo-obs-003', title: 'Observación sin ubicación', look: 'La tarjeta de mapa no debe romperse sin coordenadas.', stressOnly: true },
  { to: '/explorer/demo-obs-005', title: 'Observación sin identificar', look: 'Sin especie, sin taxón: "Sin identificar" y sin enlace a ficha.', stressOnly: true },
  { to: `/people/${DEMO_USERNAME}`, title: 'Mi perfil', look: 'Con sesión: botón Editar perfil; estadísticas; bio.' },
  { to: `/people/${DEMO_USERNAME}/observaciones`, title: 'Mis observaciones', look: 'Filtro Todas/Públicas/Privadas; menú editar/eliminar; diálogo de eliminar.' },
  { to: '/people/lau.herpeto', title: 'Perfil de otra persona', look: 'Botón Seguir (como invitado abre el aviso de inicio de sesión).' },
  { to: `/people/${LONG_USER}`, title: 'Perfil con nombre larguísimo', look: 'El nombre no debe salirse de la cabecera.', stressOnly: true },
  { to: '/taxa/1000-Leucostethus-fraterdanieli', title: 'Ficha de especie', look: 'Galería, mapa de distribución, observaciones de la especie.' },
  { to: '/taxa/1000-Leucostethus-fraterdanieli/fotos', title: 'Galería de fotos', look: 'Cuadrícula, visor a pantalla completa, "Cargar más".' },
  { to: '/search?q=pristimantis', title: 'Búsqueda', look: 'Resultados de especies y personas; sugerencias en la barra superior.' },
  { to: '/ajustes', title: 'Ajustes', look: 'Con sesión: cabecera de perfil, Apariencia, Cerrar sesión.' },
  { to: '/paquetes', title: 'Paquetes', look: 'Siempre local (no usa el backend): descarga, error, dispositivo.' },
  { to: '/salidas-de-campo', title: 'Salidas de campo', look: 'Sin salidas de ejemplo: solo se revisa el estado vacío.' },
]

function OptionList({ options, value, onChange, name }) {
  return (
    <div className="demo-options" role="radiogroup" aria-label={name}>
      {Object.entries(options).map(([key, opt]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          className={`demo-option ${value === key ? 'is-selected' : ''}`}
          onClick={() => onChange(key)}
        >
          <span className="demo-option-check" aria-hidden>{value === key && <MdCheck />}</span>
          <span className="demo-option-text">
            <strong>{opt.label}</strong>
            <small>{opt.description}</small>
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * Asistente de datos de prueba (solo en desarrollo). Llena la web con datos
 * simulados para revisar cómo se ven las pantallas y corregir errores de
 * diseño sin depender del backend.
 */
export default function DemoData() {
  const active = getDemoConfig()
  const [step, setStep] = useState(0)
  const [scenario, setScenario] = useState(active?.scenario || 'normal')
  const [session, setSession] = useState(active?.session || 'guest')
  const [latency, setLatency] = useState(active?.latency || 'instant')

  const activate = (to = '/inicio') => {
    enableDemoMode({ scenario, session, latency })
    window.location.assign(to)
  }

  const deactivate = () => {
    disableDemoMode()
    window.location.assign('/inicio')
  }

  const visibleChecks = CHECKS.filter((c) => !c.stressOnly || scenario === 'stress')
  const isLast = step === STEPS.length - 1

  return (
    <div className="demo-view theme-aware">
      <div className="container demo-content">
        <header className="demo-header">
          <span className="demo-header-icon"><MdScience aria-hidden /></span>
          <div>
            <h1>Datos de prueba</h1>
            <p>Llena la web con datos simulados para revisar cada pantalla. Solo existe en desarrollo; nada se envía al servidor.</p>
          </div>
        </header>

        {active && (
          <div className="demo-active-banner" role="status">
            <span>Activo: <strong>{DEMO_SCENARIOS[active.scenario]?.label}</strong> · {DEMO_SESSIONS[active.session]?.label} · red {DEMO_LATENCIES[active.latency]?.label.toLowerCase()}</span>
            <button type="button" className="btn-secondary" onClick={deactivate}>Desactivar</button>
          </div>
        )}

        <ol className="demo-stepper" aria-label="Pasos">
          {STEPS.map((label, i) => (
            <li key={label} className={i === step ? 'is-current' : i < step ? 'is-done' : ''}>
              <button type="button" onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>
                <span className="demo-step-num">{i < step ? <MdCheck aria-hidden /> : i + 1}</span>
                <span className="demo-step-label">{label}</span>
              </button>
            </li>
          ))}
        </ol>

        <section className="demo-panel" aria-live="polite">
          {step === 0 && (
            <>
              <h2>¿Qué quieres revisar?</h2>
              <OptionList name="Escenario" options={DEMO_SCENARIOS} value={scenario} onChange={setScenario} />
            </>
          )}
          {step === 1 && (
            <>
              <h2>¿Con qué sesión?</h2>
              <OptionList name="Sesión" options={DEMO_SESSIONS} value={session} onChange={setSession} />
            </>
          )}
          {step === 2 && (
            <>
              <h2>¿Qué velocidad de red?</h2>
              <OptionList name="Red" options={DEMO_LATENCIES} value={latency} onChange={setLatency} />
            </>
          )}
          {isLast && (
            <>
              <h2>Revisar</h2>
              <dl className="demo-summary">
                <div><dt>Escenario</dt><dd>{DEMO_SCENARIOS[scenario].label}</dd></div>
                <div><dt>Sesión</dt><dd>{DEMO_SESSIONS[session].label}</dd></div>
                <div><dt>Red</dt><dd>{DEMO_LATENCIES[latency].label}</dd></div>
              </dl>
              <p className="demo-hint">
                Recorre estas pantallas en tres anchos (teléfono ~375 px, tableta ~800 px y escritorio) y en tema claro y oscuro.
                Cada enlace activa los datos y abre la pantalla.
              </p>
              <ul className="demo-checklist">
                {visibleChecks.map((c) => (
                  <li key={c.to}>
                    <button type="button" className="demo-check-link" onClick={() => activate(c.to)}>
                      <span className="demo-check-text">
                        <strong>{c.title}</strong>
                        <small>{c.look}</small>
                      </span>
                      <MdOpenInNew aria-hidden className="demo-check-icon" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <div className="demo-nav">
          {step > 0 ? (
            <button type="button" className="btn-secondary" onClick={() => setStep(step - 1)}>
              <MdChevronLeft aria-hidden /> Atrás
            </button>
          ) : (
            <Link to="/inicio" className="btn-secondary">Cancelar</Link>
          )}
          {isLast ? (
            <button type="button" className="btn-primary demo-nav-primary" onClick={() => activate('/inicio')}>
              Activar y abrir Inicio
            </button>
          ) : (
            <button type="button" className="btn-primary demo-nav-primary" onClick={() => setStep(step + 1)}>
              Siguiente <MdChevronRight aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
