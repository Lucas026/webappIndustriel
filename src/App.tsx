import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { alarms, historyRows, initialReadings, type Reading } from './data'

type Page = 'Vue d’ensemble' | 'Historique' | 'Maintenance'

const navItems: { label: Page; icon: string }[] = [
  { label: 'Vue d’ensemble', icon: '▦' },
  { label: 'Historique', icon: '◷' },
  { label: 'Maintenance', icon: '⌁' },
]

function App() {
  const [page, setPage] = useState<Page>('Vue d’ensemble')
  const [readings, setReadings] = useState(initialReadings)
  const [aiOpen, setAiOpen] = useState(false)
  const [range, setRange] = useState('2 heures')

  useEffect(() => {
    const timer = window.setInterval(() => {
      setReadings((previous) => {
        const last = previous[previous.length - 1]
        const next: Reading = {
          time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          temperature: Number(Math.max(20, last.temperature + (Math.random() - 0.48) * 0.8).toFixed(1)),
          setpoint: 72,
          power: Math.max(0, Math.min(100, Math.round(last.power + (Math.random() - 0.5) * 8))),
        }
        return [...previous.slice(1), next]
      })
    }, 5000)
    return () => window.clearInterval(timer)
  }, [])

  const current = readings[readings.length - 1]
  const maxOvershoot = useMemo(
    () => Math.max(0, ...readings.map((reading) => reading.temperature - reading.setpoint)),
    [readings],
  )

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" onClick={() => setPage('Vue d’ensemble')}>
          <span className="brand-mark"><span /></span>
          <span className="brand-name">industrial<span>control center</span></span>
        </a>
        <div className="site-switcher">
          <span className="site-icon">IC</span>
          <span className="site-copy"><strong>Banc de chauffage</strong><small>Site de démonstration</small></span>
          <span className="chevron">⌄</span>
        </div>
        <p className="nav-caption">ESPACE DE TRAVAIL</p>
        <nav className="navigation" aria-label="Navigation principale">
          {navItems.map((item) => (
            <button key={item.label} className={`nav-item ${page === item.label ? 'selected' : ''}`} onClick={() => setPage(item.label)}>
              <span className="nav-icon">{item.icon}</span>{item.label}
              {item.label === 'Maintenance' && <span className="nav-count">2</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note"><span className="demo-dot" /><span><strong>Mode démonstration</strong><small>Données simulées localement</small></span></div>
          <div className="profile"><span className="avatar">AD</span><span><strong>Administrateur</strong><small>Superviseur</small></span><span className="profile-menu">···</span></div>
        </div>
      </aside>

      <main className="main-area" id="top">
        <header className="topbar">
          <div className="breadcrumb">Installation <span>/</span> <strong>{page}</strong></div>
          <div className="topbar-actions"><span className="updated"><span className="live-dot" /> Actualisation en direct</span><button className="icon-button" aria-label="Notifications">♧<i /></button><span className="avatar top-avatar">AD</span></div>
        </header>

        <div className="page-content">
          {page === 'Vue d’ensemble' && <Dashboard current={current} readings={readings} maxOvershoot={maxOvershoot} range={range} setRange={setRange} setPage={setPage} setAiOpen={setAiOpen} />}
          {page === 'Historique' && <HistoryPage />}
          {page === 'Maintenance' && <MaintenancePage setAiOpen={setAiOpen} />}
        </div>
      </main>
      {aiOpen && <AiModal onClose={() => setAiOpen(false)} />}
    </div>
  )
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function Dashboard({ current, readings, maxOvershoot, range, setRange, setPage, setAiOpen }: {
  current: Reading
  readings: Reading[]
  maxOvershoot: number
  range: string
  setRange: (value: string) => void
  setPage: (value: Page) => void
  setAiOpen: (value: boolean) => void
}) {
  return <>
    <PageHeading eyebrow="SUPERVISION · BANC DE CHAUFFAGE" title="Vue d’ensemble" description="Suivez les performances et l’état de votre installation." action={<button className="button button-primary" onClick={() => setAiOpen(true)}><span className="sparkle">✳</span> Analyser avec IA</button>} />
    <div className="status-banner"><span className="status-symbol">✓</span><div><strong>Installation opérationnelle</strong><span>Tous les systèmes sont en ligne et répondent normalement.</span></div><span className="status-time">Dernière vérification · à l’instant</span></div>

    <section className="metrics-grid" aria-label="Indicateurs de fonctionnement">
      <MetricCard label="Température actuelle" value={`${current.temperature.toFixed(1)} °C`} detail="Consigne · 72,0 °C" icon="◉" accent="green" />
      <MetricCard label="Écart à la consigne" value={`${(current.temperature - current.setpoint >= 0 ? '+' : '')}${(current.temperature - current.setpoint).toFixed(1)} °C`} detail="Dans la plage attendue" icon="↗" accent="blue" />
      <MetricCard label="Temps de montée" value="8 min 24 s" detail="Objectif · moins de 10 min" icon="◷" accent="orange" />
      <MetricCard label="Dépassement maximal" value={`${maxOvershoot.toFixed(1)} °C`} detail="Sur la période affichée" icon="⌁" accent="purple" />
    </section>

    <section className="chart-card card">
      <div className="card-heading chart-heading"><div><h2>Évolution du procédé</h2><p>Température, consigne et puissance de chauffe</p></div><div className="chart-actions"><select aria-label="Période du graphique" value={range} onChange={(event) => setRange(event.target.value)}><option>2 heures</option><option>8 heures</option><option>24 heures</option></select><button className="more-button" aria-label="Plus d'options">···</button></div></div>
      <div className="legend"><span><i className="legend-dot temp" />Température</span><span><i className="legend-line" />Consigne</span><span><i className="legend-dot power" />Puissance</span></div>
      <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={readings} margin={{ top: 12, right: 10, left: -15, bottom: 0 }}>
        <defs><linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#23866f" stopOpacity={0.15} /><stop offset="100%" stopColor="#23866f" stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid stroke="#edf0f2" vertical={false} />
        <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: '#929ba3', fontSize: 11 }} minTickGap={28} />
        <YAxis yAxisId="temp" domain={[50, 85]} tickLine={false} axisLine={false} tick={{ fill: '#929ba3', fontSize: 11 }} tickFormatter={(value: number) => `${value}°`} />
        <YAxis yAxisId="power" orientation="right" domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: '#929ba3', fontSize: 11 }} tickFormatter={(value: number) => `${value}%`} />
        <Tooltip content={<ChartTooltip />} />
        <Area yAxisId="temp" type="monotone" dataKey="temperature" name="Température" stroke="#27836e" strokeWidth={2.5} fill="url(#tempFill)" activeDot={{ r: 4 }} />
        <Line yAxisId="temp" type="monotone" dataKey="setpoint" name="Consigne" stroke="#87939c" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
        <Area yAxisId="power" type="monotone" dataKey="power" name="Puissance" stroke="#d8a341" strokeWidth={1.5} fill="none" dot={false} />
      </ComposedChart></ResponsiveContainer></div>
      <div className="chart-footnote"><span><span className="live-dot" /> Actualisation automatique toutes les 5 secondes</span><span>Données de démonstration</span></div>
    </section>

    <div className="lower-grid">
      <section className="card activity-card"><div className="card-heading"><div><h2>Activité récente</h2><p>Derniers événements enregistrés</p></div><button className="text-button" onClick={() => setPage('Historique')}>Tout voir <span>→</span></button></div>
        <div className="activity-list"><ActivityItem time="10:42" title="Dépassement de température" detail="Écart de +2,4 °C à la consigne" type="warning" /><ActivityItem time="10:12" title="Cycle de chauffe terminé" detail="Cycle C-026 · durée 18 min" type="success" /><ActivityItem time="09:34" title="Nouveau cycle démarré" detail="Cycle C-025 · consigne 72 °C" type="neutral" /></div>
      </section>
      <section className="card operation-card"><div className="card-heading"><div><h2>Fonctionnement</h2><p>Résumé de la journée</p></div><span className="today-tag">Aujourd’hui</span></div>
        <div className="operation-stats"><div><span className="operation-icon green-bg">◷</span><span className="operation-copy"><strong>4 h 32</strong><small>Temps de chauffe</small></span></div><div><span className="operation-icon blue-bg">↻</span><span className="operation-copy"><strong>12</strong><small>Cycles effectués</small></span></div><div><span className="operation-icon orange-bg">♧</span><span className="operation-copy"><strong>3</strong><small>Alarmes enregistrées</small></span></div></div>
        <div className="energy-note"><span>Énergie consommée</span><strong>Indisponible</strong><small>En attente d’une mesure de puissance fiable</small></div>
      </section>
    </div>
  </>
}

function MetricCard({ label, value, detail, icon, accent }: { label: string; value: string; detail: string; icon: string; accent: string }) {
  return <article className="metric-card card"><div className={`metric-icon ${accent}`}>{icon}</div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-detail">{detail}</span></article>
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return <div className="chart-tooltip"><strong>{label}</strong>{payload.map((item) => <span key={item.name}><i style={{ backgroundColor: item.color }} />{item.name}<b>{item.value}{item.name === 'Puissance' ? '%' : ' °C'}</b></span>)}</div>
}

function ActivityItem({ time, title, detail, type }: { time: string; title: string; detail: string; type: string }) {
  return <div className="activity-item"><span className={`activity-marker ${type}`} /><span className="activity-time">{time}</span><span className="activity-copy"><strong>{title}</strong><small>{detail}</small></span><span className="activity-arrow">›</span></div>
}

function HistoryPage() {
  return <>
    <PageHeading eyebrow="SUPERVISION · DONNÉES" title="Historique" description="Consultez les cycles et les alarmes de l’installation." action={<button className="button button-secondary" onClick={() => window.print()}>↓ Exporter</button>} />
    <section className="card history-card"><div className="tabs"><button className="tab active">Cycles de chauffe <span>26</span></button><button className="tab" onClick={(event) => event.currentTarget.classList.toggle('active')}>Alarmes <span>3</span></button><div className="history-filters"><select aria-label="Filtrer par période"><option>7 derniers jours</option><option>30 derniers jours</option></select></div></div>
      <div className="table-scroll"><table><thead><tr><th>Cycle</th><th>Date de début</th><th>Durée</th><th>Température max.</th><th>Résultat</th></tr></thead><tbody>{historyRows.map((row) => <tr key={row.cycle}><td className="cycle-id">{row.cycle}</td><td>{row.start}</td><td>{row.duration}</td><td>{row.peak}</td><td><span className={`result-pill ${row.result === 'Alerte' ? 'result-alert' : ''}`}><i />{row.result}</span></td></tr>)}</tbody></table></div>
      <div className="table-footer"><span>Affichage de 5 cycles sur 26</span><div><button disabled>←</button><button className="page-number">1</button><button>2</button><button>3</button><button>→</button></div></div>
    </section>
    <section className="card alarm-history"><div className="card-heading"><div><h2>Historique des alarmes</h2><p>Événements signalés sur l’installation</p></div><span className="today-tag">3 événements</span></div><div className="alarm-list">{alarms.map((alarm) => <div key={alarm.title} className="alarm-row"><span className={`severity-icon ${alarm.severity.toLowerCase()}`}>{alarm.severity === 'Critique' ? '!' : alarm.severity === 'Avertissement' ? '△' : 'i'}</span><div className="alarm-copy"><strong>{alarm.title}</strong><span>{alarm.detail}</span></div><span className="alarm-date">{alarm.time}</span><span className={`severity-tag ${alarm.severity.toLowerCase()}`}>{alarm.severity}</span></div>)}</div></section>
  </>
}

function MaintenancePage({ setAiOpen }: { setAiOpen: (value: boolean) => void }) {
  return <>
    <PageHeading eyebrow="INSTALLATION · MAINTENANCE" title="Maintenance" description="Surveillez l’état du banc et anticipez les interventions." action={<button className="button button-primary" onClick={() => setAiOpen(true)}><span className="sparkle">✳</span> Analyser avec IA</button>} />
    <div className="maintenance-banner"><span className="maintenance-symbol">⌁</span><div><strong>2 points à surveiller</strong><span>Les recommandations ci-dessous sont indicatives et basées sur des données simulées.</span></div></div>
    <div className="maintenance-grid"><section className="card maintenance-card"><div className="maintenance-card-top"><span className="maintenance-icon orange-bg">△</span><span className="priority-tag">À surveiller</span></div><h2>Vérifier la sonde de température</h2><p>Un écart ponctuel entre les sondes a été signalé. Vérifiez les connexions et l’étalonnage lors du prochain arrêt.</p><div className="maintenance-meta"><span>Signalé hier · 16:07</span><button className="text-button">Marquer comme traité</button></div></section>
      <section className="card maintenance-card"><div className="maintenance-card-top"><span className="maintenance-icon blue-bg">◷</span><span className="priority-tag info-tag">Préventif</span></div><h2>Contrôle périodique du chauffage</h2><p>Un contrôle visuel des éléments chauffants est recommandé après 100 cycles de fonctionnement.</p><div className="maintenance-progress"><span><b>68 cycles</b> sur 100</span><div><i /></div></div><div className="maintenance-meta"><span>Dernier contrôle · il y a 32 cycles</span><button className="text-button">Planifier</button></div></section>
      <section className="card ai-callout"><div className="ai-orb">✳</div><div><span className="eyebrow">ASSISTANT DE MAINTENANCE</span><h2>Besoin d’un diagnostic ?</h2><p>L’analyse IA pourra examiner les mesures et événements récents lorsque le service sera connecté.</p><button className="button button-primary" onClick={() => setAiOpen(true)}>Analyser les données <span>→</span></button></div><span className="ai-label">APERÇU DÉMO</span></section>
    </div>
    <section className="card maintenance-footnote"><span>i</span><p>Les suggestions affichées sont des exemples d’interface. Elles ne remplacent pas les procédures de maintenance ni une analyse des données réelles.</p></section>
  </>
}

function AiModal({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onClick={onClose}><section className="ai-modal" role="dialog" aria-modal="true" aria-labelledby="ai-title" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Fermer">×</button><div className="ai-orb">✳</div><span className="eyebrow">ASSISTANT IA · APERÇU</span><h2 id="ai-title">Analyse non connectée</h2><p>Le module IA est prêt à être raccordé. Il faudra définir le service d’analyse, les données à lui transmettre et le format de sa réponse.</p><div className="modal-demo-note"><strong>Exemple de diagnostic</strong><span>Une légère variation de température est visible dans les mesures simulées. Aucune conclusion opérationnelle ne peut être tirée sans données réelles.</span></div><button className="button button-primary modal-action" onClick={onClose}>Compris</button></section></div>
}

export default App
