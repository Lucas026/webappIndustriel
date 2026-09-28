import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { formatTimestamp, getAlarmEvents, mapMeasurement, type AlarmEvent, type Reading } from './data'
import { getMeasurements, subscribeToMeasurements } from './services/installations'
import { insertMeasurements } from './services/telemetry'
import type { Measurement } from './lib/database.types'
import { getCurrentUserEmail, readControlSetpoint, signIn, signOut, subscribeToAuthChanges, writeControlSetpoint } from './services/control'

type Page = 'Vue d’ensemble' | 'Historique' | 'Maintenance'

const navItems: { label: Page; icon: string }[] = [
  { label: 'Vue d’ensemble', icon: '▦' },
  { label: 'Historique', icon: '◷' },
  { label: 'Maintenance', icon: '⌁' },
]

function App() {
  const [page, setPage] = useState<Page>('Vue d’ensemble')
  const [readings, setReadings] = useState<Reading[]>([])
  const [alarms, setAlarms] = useState<AlarmEvent[]>([])
  const [history, setHistory] = useState<Reading[]>([])
  const [aiOpen, setAiOpen] = useState(false)
  const [range, setRange] = useState('2 heures')
  const [refreshSeconds, setRefreshSeconds] = useState(() => {
    const saved = Number(window.localStorage.getItem('measurements-refresh-seconds'))
    return [0, 2, 5, 10, 30, 60, -1].includes(saved) ? saved : 5
  })
  const [customRefreshParts, setCustomRefreshParts] = useState(() => {
    const saved = Number(window.localStorage.getItem('measurements-custom-refresh-seconds'))
    const seconds = Number.isInteger(saved) && saved >= 1 && saved <= 3600 ? saved : 15
    return { hours: Math.floor(seconds / 3600), minutes: Math.floor((seconds % 3600) / 60), seconds: seconds % 60 }
  })
  const customRefreshSeconds = Math.min(3600, customRefreshParts.hours * 3600 + customRefreshParts.minutes * 60 + customRefreshParts.seconds)
  const [realtimeEnabled, setRealtimeEnabled] = useState(true)
  const [realtimeStatus, setRealtimeStatus] = useState('CONNECTING')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [targetSetpoint, setTargetSetpoint] = useState<number | null>(null)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authUser, setAuthUser] = useState<string | null>(null)
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const refreshing = useRef(false)

  const refreshMeasurements = useCallback(async () => {
    if (refreshing.current) return
    refreshing.current = true
    setLoading(true)
    try {
      const fetched = await getMeasurements({ limit: 1000 })
      const mapped = fetched.map(mapMeasurement)
      setReadings(mapped)
      setAlarms(getAlarmEvents(mapped))
      setHistory(mapped.slice().reverse())
      try {
        const storedSetpoint = await readControlSetpoint()
        if (storedSetpoint !== null) setTargetSetpoint(storedSetpoint)
      } catch {
        setTargetSetpoint(null)
      }
      setError(null)
      setLastUpdated(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de lire les mesures.')
    } finally {
      refreshing.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('measurements-refresh-seconds', String(refreshSeconds))
    if (customRefreshSeconds > 0) window.localStorage.setItem('measurements-custom-refresh-seconds', String(customRefreshSeconds))
    void refreshMeasurements()
    if (refreshSeconds === 0) return
    const intervalSeconds = refreshSeconds === -1 ? Math.max(1, Math.min(3600, customRefreshSeconds)) : refreshSeconds
    const timer = window.setInterval(() => void refreshMeasurements(), intervalSeconds * 1000)
    return () => window.clearInterval(timer)
  }, [refreshMeasurements, refreshSeconds, customRefreshSeconds])

  useEffect(() => {
    if (!realtimeEnabled) {
      setRealtimeStatus('CLOSED')
      return
    }
    return subscribeToMeasurements(() => void refreshMeasurements(), setRealtimeStatus)
  }, [refreshMeasurements, realtimeEnabled])

  useEffect(() => {
    void getCurrentUserEmail().then(setAuthUser).catch((cause: unknown) => {
      setAuthMessage(cause instanceof Error ? cause.message : 'Impossible de lire la session Supabase.')
    })
    return subscribeToAuthChanges(setAuthUser)
  }, [])

  const current = readings[readings.length - 1]
  const filteredReadings = useMemo(() => {
    const duration = range === '8 heures' ? 8 : range === '24 heures' ? 24 : 2
    const cutoff = Date.now() - duration * 60 * 60 * 1000
    return readings.filter((reading) => new Date(reading.timestamp).getTime() >= cutoff)
  }, [readings, range])
  const activeRangeOvershoot = useMemo(
    () => Math.max(0, ...filteredReadings.flatMap((reading) => reading.temperature !== null && reading.setpoint !== null ? [reading.temperature - reading.setpoint] : [])),
    [filteredReadings],
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
          <span className="site-copy"><strong>Banc de chauffage</strong><small>Supabase</small></span>

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
          <div className="demo-note"><span className={`demo-dot ${error ? 'error-dot' : ''}`} /><span><strong>{error ? 'Connexion indisponible' : 'Données Supabase'}</strong><small>{error ? 'Vérifier la configuration' : 'Lecture en direct'}</small></span></div>

          <div className="profile"><span className="avatar">AD</span><span><strong>Administrateur</strong><small>Superviseur</small></span><span className="profile-menu">···</span></div>
        </div>
      </aside>

      <main className="main-area" id="top">
        <header className="topbar">
          <div className="breadcrumb">Installation <span>/</span> <strong>{page}</strong></div>
          <div className="topbar-actions"><label className="refresh-control"><span>Lecture</span><select aria-label="Fréquence de lecture des données" value={refreshSeconds} onChange={(event) => setRefreshSeconds(Number(event.target.value))}><option value={0}>Manuelle</option><option value={2}>2 s</option><option value={5}>5 s</option><option value={10}>10 s</option><option value={30}>30 s</option><option value={60}>1 min</option><option value={-1}>Personnalisé</option></select>{refreshSeconds === -1 && <span className="custom-refresh-fields"><input aria-label="Heures" type="number" min="0" max="1" value={customRefreshParts.hours} onChange={(event) => { const hours = Number(event.target.value); if (Number.isInteger(hours) && hours >= 0 && hours <= 1) setCustomRefreshParts((parts) => ({ ...parts, hours })) }} /><span>h</span><input aria-label="Minutes" type="number" min="0" max="59" value={customRefreshParts.minutes} onChange={(event) => { const minutes = Number(event.target.value); if (Number.isInteger(minutes) && minutes >= 0 && minutes <= 59) setCustomRefreshParts((parts) => ({ ...parts, minutes })) }} /><span>min</span><input aria-label="Secondes" type="number" min="0" max="59" value={customRefreshParts.seconds} onChange={(event) => { const seconds = Number(event.target.value); if (Number.isInteger(seconds) && seconds >= 0 && seconds <= 59) setCustomRefreshParts((parts) => ({ ...parts, seconds })) }} /><span>s</span></span>}</label><label className="realtime-control" title={`Supabase Realtime : ${realtimeStatus}`}><input type="checkbox" checked={realtimeEnabled} onChange={(event) => setRealtimeEnabled(event.target.checked)} /><span>Direct</span><i className={`realtime-indicator ${realtimeStatus === 'SUBSCRIBED' ? 'connected' : ''}`} /></label><span className="updated"><span className={`live-dot ${error ? 'error-dot' : ''}`} />{loading ? 'Lecture…' : error ? 'Erreur Supabase' : `Lu à ${lastUpdated}`}</span><button className="icon-button" aria-label="Lire maintenant" onClick={() => void refreshMeasurements()}>⟳</button><button className="button button-secondary" onClick={() => setPage('Maintenance')}>{targetSetpoint === null ? 'Consigne' : `${targetSetpoint.toFixed(1)} °C`}</button><span className="avatar top-avatar">{authUser ? authUser.slice(0, 2).toUpperCase() : 'AD'}</span></div>
        </header>

        <div className="page-content">
          {error && <div className="data-error" role="alert"><strong>Lecture des mesures impossible</strong><span>{error}</span><button className="text-button" onClick={() => void refreshMeasurements()}>Réessayer</button></div>}
          {page === 'Vue d’ensemble' && <Dashboard current={current} readings={filteredReadings} alarms={alarms} maxOvershoot={activeRangeOvershoot} range={range} setRange={setRange} setPage={setPage} setAiOpen={setAiOpen} loading={loading} error={error} realtimeEnabled={realtimeEnabled} realtimeStatus={realtimeStatus} refreshSeconds={refreshSeconds} customRefreshSeconds={customRefreshSeconds} />}
          {page === 'Historique' && <HistoryPage history={history} alarms={alarms} loading={loading} />}
          {page === 'Maintenance' && <MaintenancePage onInsertMeasurement={async (row) => { await insertMeasurements([row]); await refreshMeasurements() }} setAiOpen={setAiOpen} targetSetpoint={targetSetpoint} onSaveSetpoint={async (setpoint) => { await writeControlSetpoint(setpoint); setTargetSetpoint(setpoint) }} authUser={authUser} authEmail={authEmail} setAuthEmail={setAuthEmail} authPassword={authPassword} setAuthPassword={setAuthPassword} onSignIn={async () => { await signIn(authEmail, authPassword); setAuthPassword(''); setAuthMessage(null); void refreshMeasurements() }} onSignOut={async () => { await signOut(); setAuthMessage(null); setTargetSetpoint(null); void refreshMeasurements() }} authMessage={authMessage} />}
        </div>
      </main>
      {aiOpen && <AiModal onClose={() => setAiOpen(false)} />}
    </div>
  )
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function Dashboard({ current, readings, alarms, maxOvershoot, range, setRange, setPage, setAiOpen, loading, error, realtimeEnabled, realtimeStatus, refreshSeconds, customRefreshSeconds }: {
  current?: Reading
  readings: Reading[]
  alarms: AlarmEvent[]
  maxOvershoot: number
  range: string
  setRange: (value: string) => void
  setPage: (value: Page) => void
  setAiOpen: (value: boolean) => void
  loading: boolean
  error: string | null
  realtimeEnabled: boolean
  realtimeStatus: string
  refreshSeconds: number
  customRefreshSeconds: number
}) {
  const latest = current
  return <>
      <PageHeading eyebrow="SUPERVISION · BANC DE CHAUFFAGE" title="Vue d’ensemble" description="Suivez les performances et l’état de votre installation." action={<button className="button button-primary" onClick={() => setAiOpen(true)}><span className="sparkle">✳</span> Analyser avec IA</button>} />
      <div className={`status-banner ${error ? 'warning-banner' : ''}`}><span className="status-symbol">{error ? '!' : latest ? '✓' : '·'}</span><div><strong>{error ? 'Lecture Supabase impossible' : latest ? 'Dernières mesures chargées' : loading ? 'Chargement des mesures' : 'Aucune mesure disponible'}</strong><span>{error ?? (latest ? `Dernière mesure enregistrée le ${formatTimestamp(latest.timestamp)}` : 'La table measurements ne contient pas encore de mesures.')}</span></div></div>


    <section className="metrics-grid" aria-label="Indicateurs de fonctionnement">
      <MetricCard label="Température actuelle" value={latest?.temperature != null ? `${latest.temperature.toFixed(1)} °C` : '—'} detail={latest?.timestamp ? `Mesurée · ${latest.time}` : 'Aucune mesure'} icon="◉" accent="green" />
      <MetricCard label="Écart à la consigne" value={latest?.temperature != null && latest.setpoint != null ? `${latest.temperature - latest.setpoint >= 0 ? '+' : ''}${(latest.temperature - latest.setpoint).toFixed(1)} °C` : '—'} detail={latest?.setpoint != null ? `Consigne · ${latest.setpoint.toFixed(1)} °C` : 'Consigne indisponible'} icon="↗" accent="blue" />
      <MetricCard label="Chauffage" value={latest?.heatingState == null ? '—' : latest.heatingState ? 'Actif' : 'Arrêté'} detail={latest?.power != null ? `Valeur heating_power · ${latest.power}` : 'Valeur de puissance indisponible'} icon="◷" accent="orange" />
      <MetricCard label="Dépassement maximal" value={`${maxOvershoot.toFixed(1)} °C`} detail="Sur la période affichée" icon="⌁" accent="purple" />
    </section>

    <section className="chart-card card">
      <div className="card-heading chart-heading"><div><h2>Évolution du procédé</h2><p>Température, consigne et puissance de chauffe</p></div><div className="chart-actions"><select aria-label="Période du graphique" value={range} onChange={(event) => setRange(event.target.value)}><option>2 heures</option><option>8 heures</option><option>24 heures</option></select><button className="more-button" aria-label="Plus d'options">···</button></div></div>
      <div className="legend"><span><i className="legend-dot temp" />Température</span><span><i className="legend-line" />Consigne</span><span><i className="legend-dot power" />Puissance / commande</span></div>
      {readings.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={readings} margin={{ top: 12, right: 10, left: -15, bottom: 0 }}>
        <defs><linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#23866f" stopOpacity={0.15} /><stop offset="100%" stopColor="#23866f" stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid stroke="#edf0f2" vertical={false} />
        <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: '#929ba3', fontSize: 11 }} minTickGap={28} />
        <YAxis yAxisId="temp" domain={['auto', 'auto']} tickLine={false} axisLine={false} tick={{ fill: '#929ba3', fontSize: 11 }} tickFormatter={(value: number) => `${value}°`} />
        <YAxis yAxisId="power" orientation="right" domain={[0, 'auto']} tickLine={false} axisLine={false} tick={{ fill: '#929ba3', fontSize: 11 }} />
        <Tooltip content={<ChartTooltip />} />
        <Area yAxisId="temp" type="monotone" dataKey="temperature" name="Température" stroke="#27836e" strokeWidth={2.5} fill="url(#tempFill)" activeDot={{ r: 4 }} connectNulls />
        <Line yAxisId="temp" type="monotone" dataKey="setpoint" name="Consigne" stroke="#87939c" strokeWidth={1.5} strokeDasharray="5 5" dot={false} connectNulls />
        <Area yAxisId="power" type="monotone" dataKey="power" name="Chauffage" stroke="#d8a341" strokeWidth={1.5} fill="none" dot={false} connectNulls />
      </ComposedChart></ResponsiveContainer></div> : <div className="empty-state chart-empty">{loading ? 'Chargement des mesures…' : 'Aucune mesure sur cette période.'}</div>}
      <div className="chart-footnote"><span><span className="live-dot" /> {realtimeEnabled ? realtimeStatus === 'SUBSCRIBED' ? 'Supabase Realtime connecté' : `Realtime · ${realtimeStatus}` : refreshSeconds === 0 ? 'Lecture manuelle' : `Lecture toutes les ${refreshSeconds === -1 ? customRefreshSeconds : refreshSeconds} s`}</span><span>{readings.length} mesures affichées · puissance sans unité confirmée</span></div>
    </section>

    <div className="lower-grid">
      <section className="card activity-card"><div className="card-heading"><div><h2>Activité récente</h2><p>Derniers événements enregistrés</p></div><button className="text-button" onClick={() => setPage('Historique')}>Tout voir <span>→</span></button></div>
        <div className="activity-list">{alarms.slice(0, 3).map((alarm) => <ActivityItem key={alarm.id} time={new Date(alarm.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} title={`Code alarme · ${alarm.code}`} detail={`${alarm.temperature == null ? 'Température indisponible' : `${alarm.temperature.toFixed(1)} °C`}${alarm.cycleNumber == null ? '' : ` · cycle ${alarm.cycleNumber}`}`} type="warning" />)}{alarms.length === 0 && <div className="empty-state compact-empty">Aucun code alarme dans les mesures récentes.</div>}</div>
      </section>
      <section className="card operation-card"><div className="card-heading"><div><h2>Fonctionnement</h2><p>Résumé de la journée</p></div><span className="today-tag">Aujourd’hui</span></div>
        <div className="operation-stats"><div><span className="operation-icon green-bg">◷</span><span className="operation-copy"><strong>{readings.filter((reading) => reading.heatingState === true).length}</strong><small>Mesures avec chauffage actif</small></span></div><div><span className="operation-icon blue-bg">↻</span><span className="operation-copy"><strong>{new Set(readings.map((reading) => reading.cycleNumber).filter((cycle): cycle is number => cycle !== null)).size}</strong><small>Cycles distincts dans la période</small></span></div><div><span className="operation-icon orange-bg">♧</span><span className="operation-copy"><strong>{alarms.length}</strong><small>Mesures avec code alarme</small></span></div></div>
        <div className="energy-note"><span>Énergie consommée</span><strong>Indisponible</strong><small>Unité de heating_power à confirmer</small></div>
      </section>
    </div>
  </>
}

function MetricCard({ label, value, detail, icon, accent }: { label: string; value: string; detail: string; icon: string; accent: string }) {
  return <article className="metric-card card"><div className={`metric-icon ${accent}`}>{icon}</div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-detail">{detail}</span></article>
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return <div className="chart-tooltip"><strong>{label}</strong>{payload.map((item) => <span key={item.name}><i style={{ backgroundColor: item.color }} />{item.name}<b>{item.value}{item.name === 'Température' || item.name === 'Consigne' ? ' °C' : ''}</b></span>)}</div>
}

function ActivityItem({ time, title, detail, type }: { time: string; title: string; detail: string; type: string }) {
  return <div className="activity-item"><span className={`activity-marker ${type}`} /><span className="activity-time">{time}</span><span className="activity-copy"><strong>{title}</strong><small>{detail}</small></span><span className="activity-arrow">›</span></div>
}

function HistoryPage({ history, alarms, loading }: { history: Reading[]; alarms: AlarmEvent[]; loading: boolean }) {
  const [tab, setTab] = useState<'measurements' | 'alarms'>('measurements')
  return <>
    <PageHeading eyebrow="SUPERVISION · DONNÉES" title="Historique" description="Mesures et codes d’alarme lus depuis Supabase." action={<button className="button button-secondary" onClick={() => window.print()}>↓ Exporter</button>} />
    <section className="card history-card"><div className="tabs"><button className={`tab ${tab === 'measurements' ? 'active' : ''}`} onClick={() => setTab('measurements')}>Mesures <span>{history.length}</span></button><button className={`tab ${tab === 'alarms' ? 'active' : ''}`} onClick={() => setTab('alarms')}>Alarmes <span>{alarms.length}</span></button></div>
      {tab === 'measurements' && <><div className="table-scroll"><table><thead><tr><th>Horodatage</th><th>Température</th><th>Consigne</th><th>Puissance chauffe</th><th>État chauffage</th><th>Ventilateur</th><th>PID</th><th>Mode</th><th>Cycle</th></tr></thead><tbody>{history.map((row) => <tr key={row.id}><td>{formatTimestamp(row.timestamp)}</td><td>{row.temperature == null ? '—' : `${row.temperature.toFixed(2)} °C`}</td><td>{row.setpoint == null ? '—' : `${row.setpoint.toFixed(2)} °C`}</td><td>{row.power == null ? '—' : row.power.toFixed(2)}</td><td>{row.heatingState == null ? '—' : row.heatingState ? 'Actif' : 'Arrêté'}</td><td>{row.fanState == null ? '—' : row.fanState ? 'Actif' : 'Arrêté'}</td><td>{row.pidOutput == null ? '—' : row.pidOutput.toFixed(2)}</td><td>{row.operatingMode ?? '—'}</td><td>{row.cycleNumber ?? '—'}</td></tr>)}</tbody></table>{!history.length && <div className="empty-state">{loading ? 'Chargement des mesures…' : 'Aucune mesure disponible dans Supabase.'}</div>}</div><div className="table-footer"><span>{history.length} dernières mesures (limite : 1 000)</span></div></>}
      {tab === 'alarms' && <div className="alarm-list">{alarms.map((alarm) => <div key={alarm.id} className="alarm-row"><span className="severity-icon avertissement">!</span><div className="alarm-copy"><strong>{alarm.code}</strong><span>{alarm.temperature == null ? 'Température indisponible' : `Température ${alarm.temperature.toFixed(2)} °C`}{alarm.cycleNumber == null ? '' : ` · cycle ${alarm.cycleNumber}`}</span></div><span className="alarm-date">{formatTimestamp(alarm.timestamp)}</span><span className={`severity-tag ${alarm.code.toLowerCase().includes('high') || alarm.code.toLowerCase().includes('over') || alarm.code.toLowerCase().includes('fault') ? 'avertissement' : 'information'}`}>Code défaut</span></div>)}{!alarms.length && <div className="empty-state">{loading ? 'Chargement des alarmes…' : 'Aucun code alarme enregistré.'}</div>}</div>}
    </section>
  </>
}

function MaintenancePage({ onInsertMeasurement, setAiOpen, targetSetpoint, onSaveSetpoint, authUser, authEmail, setAuthEmail, authPassword, setAuthPassword, onSignIn, onSignOut, authMessage }: {
  onInsertMeasurement: (row: Omit<Measurement, 'id' | 'timestamp'> & { timestamp?: string }) => Promise<void>
  setAiOpen: (value: boolean) => void
  targetSetpoint: number | null
  onSaveSetpoint: (setpoint: number) => Promise<void>
  authUser: string | null
  authEmail: string
  setAuthEmail: (value: string) => void
  authPassword: string
  setAuthPassword: (value: string) => void
  onSignIn: () => Promise<void>
  onSignOut: () => Promise<void>
  authMessage: string | null
}) {
  const [setpointDraft, setSetpointDraft] = useState(targetSetpoint === null ? '' : String(targetSetpoint))
  const [setpointMessage, setSetpointMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [measurementMessage, setMeasurementMessage] = useState<string | null>(null)
  const [measurementDraft, setMeasurementDraft] = useState({ temperature: '', setpoint: '', heatingPower: '', heatingState: 'unknown', fanState: 'unknown', pidOutput: '', operatingMode: 'automatic', alarmCode: '', cycleNumber: '' })

  useEffect(() => {
    setSetpointDraft(targetSetpoint === null ? '' : String(targetSetpoint))
  }, [targetSetpoint])

  const submitSetpoint = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = Number(setpointDraft)
    if (!Number.isFinite(value) || value < 0 || value > 999.99) {
      setSetpointMessage('Entrez une consigne comprise entre 0 et 999,99 °C.')
      return
    }
    setBusy(true)
    setSetpointMessage(null)
    try {
      await onSaveSetpoint(value)
      setSetpointMessage('Consigne cible enregistrée dans Supabase.')
    } catch (cause) {
      setSetpointMessage(cause instanceof Error ? cause.message : 'Impossible d’enregistrer la consigne.')
    } finally {
      setBusy(false)
    }
  }

  const submitMeasurement = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const numberValue = (value: string) => value.trim() === '' ? null : Number(value)
    const row = {
      temperature: numberValue(measurementDraft.temperature),
      setpoint: numberValue(measurementDraft.setpoint),
      heating_power: numberValue(measurementDraft.heatingPower),
      heating_state: measurementDraft.heatingState === 'unknown' ? null : measurementDraft.heatingState === 'on',
      fan_state: measurementDraft.fanState === 'unknown' ? null : measurementDraft.fanState === 'on',
      pid_output: numberValue(measurementDraft.pidOutput),
      operating_mode: measurementDraft.operatingMode || null,
      alarm_code: measurementDraft.alarmCode || null,
      cycle_number: measurementDraft.cycleNumber.trim() === '' ? null : Number(measurementDraft.cycleNumber),
    }
    if (Object.values(row).every((value) => value === null)) {
      setMeasurementMessage('Renseignez au moins une valeur avant l’enregistrement.')
      return
    }
    if ([row.temperature, row.setpoint, row.heating_power, row.pid_output].some((value) => value !== null && (!Number.isFinite(value) || value < -999.99 || value > 999.99)) || (row.cycle_number !== null && (!Number.isInteger(row.cycle_number) || row.cycle_number < -2147483648 || row.cycle_number > 2147483647))) {
      setMeasurementMessage('Valeur numérique hors limites ou numéro de cycle non entier.')
      return
    }
    setBusy(true)
    setMeasurementMessage(null)
    try {
      await onInsertMeasurement(row)
      setMeasurementDraft({ temperature: '', setpoint: '', heatingPower: '', heatingState: 'unknown', fanState: 'unknown', pidOutput: '', operatingMode: 'automatic', alarmCode: '', cycleNumber: '' })
      setMeasurementMessage('Mesure ajoutée à Supabase.')
    } catch (cause) {
      setMeasurementMessage(cause instanceof Error ? cause.message : 'Insertion Supabase impossible.')
    } finally {
      setBusy(false)
    }
  }

  const submitSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    try {
      await onSignIn()
    } catch (cause) {
      setSetpointMessage(cause instanceof Error ? cause.message : 'Connexion impossible.')
    } finally {
      setBusy(false)
    }
  }

  const handleSignOut = async () => {
    setBusy(true)
    try {
      await onSignOut()
    } catch (cause) {
      setSetpointMessage(cause instanceof Error ? cause.message : 'Déconnexion impossible.')
    } finally {
      setBusy(false)
    }
  }
  return <>
    <PageHeading eyebrow="INSTALLATION · COMMANDE" title="Consigne de contrôle" description="Enregistrez une consigne cible dans Supabase. Le backend/PLC doit lire cette valeur avant tout pilotage réel." action={<button className="button button-primary" onClick={() => setAiOpen(true)}><span className="sparkle">✳</span> Analyser avec IA</button>} />
    <section className="card control-card"><div className="card-heading"><div><h2>Consigne cible</h2><p>Valeur partagée stockée dans control_settings</p></div><span className={`severity-tag ${authUser ? 'information' : 'avertissement'}`}>{authUser ? 'Connecté' : 'Lecture seule'}</span></div>
      <div className="control-current"><span>Consigne enregistrée</span><strong>{targetSetpoint === null ? 'Non définie' : `${targetSetpoint.toFixed(2)} °C`}</strong></div>
      {authUser ? <><form className="setpoint-form" onSubmit={(event) => void submitSetpoint(event)}><label htmlFor="target-setpoint">Nouvelle consigne (°C)</label><div><input id="target-setpoint" type="number" min="0" max="999.99" step="0.01" required value={setpointDraft} onChange={(event) => setSetpointDraft(event.target.value)} /><button className="button button-primary" type="submit" disabled={busy || !authUser}>{busy ? 'Enregistrement…' : 'Enregistrer dans Supabase'}</button></div></form><div className="auth-row"><span>Session · {authUser}</span><button className="text-button" onClick={() => void handleSignOut()} disabled={busy}>Se déconnecter</button></div></> : <form className="auth-form" onSubmit={(event) => void submitSignIn(event)}><p>Connectez-vous avec un utilisateur Supabase pour modifier la consigne.</p><label htmlFor="auth-email">Courriel</label><input id="auth-email" type="email" autoComplete="username" required value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} /><label htmlFor="auth-password">Mot de passe</label><input id="auth-password" type="password" autoComplete="current-password" required value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} /><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>{authMessage && <p className="form-message">{authMessage}</p>}</form>}
      {setpointMessage && <p className="form-message" role="status">{setpointMessage}</p>}
      <div className="maintenance-banner control-warning"><span className="maintenance-symbol">!</span><div><strong>Enregistrement de consigne uniquement</strong><span>Cette valeur ne pilote pas encore le chauffage. Le backend ou le PLC doit la consommer et appliquer ses propres limites de sécurité.</span></div></div>
    </section>
    <section className="card control-card measurement-entry-card"><div className="card-heading"><div><h2>Ajouter une mesure</h2><p>Crée un relevé dans Supabase. Les noms entre parenthèses correspondent aux colonnes de la table.</p></div></div>
      <form className="measurement-entry-form" onSubmit={(event) => void submitMeasurement(event)}>
        <label>Température mesurée (temperature · °C)<input type="number" step="0.01" value={measurementDraft.temperature} onChange={(event) => setMeasurementDraft({ ...measurementDraft, temperature: event.target.value })} /></label>
        <label>Consigne de chauffe (setpoint · °C)<input type="number" step="0.01" value={measurementDraft.setpoint} onChange={(event) => setMeasurementDraft({ ...measurementDraft, setpoint: event.target.value })} /></label>
        <label>Puissance / commande chauffage (heating_power · unité à confirmer)<input type="number" step="0.01" value={measurementDraft.heatingPower} onChange={(event) => setMeasurementDraft({ ...measurementDraft, heatingPower: event.target.value })} /></label>
        <label>Sortie du régulateur PID (pid_output)<input type="number" step="0.01" value={measurementDraft.pidOutput} onChange={(event) => setMeasurementDraft({ ...measurementDraft, pidOutput: event.target.value })} /></label>
        <label>Chauffage actif (heating_state)<select value={measurementDraft.heatingState} onChange={(event) => setMeasurementDraft({ ...measurementDraft, heatingState: event.target.value })}><option value="unknown">Inconnu</option><option value="on">Actif</option><option value="off">Arrêté</option></select></label>
        <label>Ventilateur actif (fan_state)<select value={measurementDraft.fanState} onChange={(event) => setMeasurementDraft({ ...measurementDraft, fanState: event.target.value })}><option value="unknown">Inconnu</option><option value="on">Actif</option><option value="off">Arrêté</option></select></label>
        <label>Mode de fonctionnement (operating_mode)<input placeholder="automatic, manual…" maxLength={50} value={measurementDraft.operatingMode} onChange={(event) => setMeasurementDraft({ ...measurementDraft, operatingMode: event.target.value })} /></label>
        <label>Code défaut ou alarme (alarm_code)<input placeholder="Laisser vide si aucun" maxLength={50} value={measurementDraft.alarmCode} onChange={(event) => setMeasurementDraft({ ...measurementDraft, alarmCode: event.target.value })} /></label>
        <label>Numéro de cycle (cycle_number)<input type="number" step="1" value={measurementDraft.cycleNumber} onChange={(event) => setMeasurementDraft({ ...measurementDraft, cycleNumber: event.target.value })} /></label>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Ajouter la mesure'}</button>
      </form>
      {measurementMessage && <p className="form-message" role="status">{measurementMessage}</p>}
    </section>
      <div className="maintenance-grid">
      <section className="card ai-callout"><div className="ai-orb">✳</div><div><span className="eyebrow">ASSISTANT DE MAINTENANCE</span><h2>Besoin d’un diagnostic ?</h2><p>L’analyse IA pourra examiner les mesures et événements récents lorsque le service sera connecté.</p><button className="button button-primary" onClick={() => setAiOpen(true)}>Analyser les données <span>→</span></button></div><span className="ai-label">APERÇU DÉMO</span></section>
    </div>
    <section className="card maintenance-footnote"><span>i</span><p>Les cartes de maintenance sont encore des exemples d’interface ; aucune table de maintenance n’est présente dans le schéma Supabase.</p></section>
  </>
}

function AiModal({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onClick={onClose}><section className="ai-modal" role="dialog" aria-modal="true" aria-labelledby="ai-title" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Fermer">×</button><div className="ai-orb">✳</div><span className="eyebrow">ASSISTANT IA · APERÇU</span><h2 id="ai-title">Analyse non connectée</h2><p>Le module IA est prêt à être raccordé. Il faudra définir le service d’analyse, les données à lui transmettre et le format de sa réponse.</p><div className="modal-demo-note"><strong>Exemple de diagnostic</strong><span>Les mesures sont désormais lues depuis Supabase. Le service d’analyse IA et son format de réponse restent à raccorder.</span></div><button className="button button-primary modal-action" onClick={onClose}>Compris</button></section></div>
}

export default App
