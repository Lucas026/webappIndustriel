import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { formatTimestamp, getAlarmEvents, getMaintenanceMetrics, getProcessSignals, mapMeasurement, OVERSHOOT_ALERT_THRESHOLD_C, type AlarmEvent, type Reading } from './data'
import { getMeasurements, subscribeToMeasurements } from './services/installations'
import { insertMeasurements } from './services/telemetry'
import type { Measurement } from './lib/database.types'
import { getCurrentUserEmail, readControlSetpoint, signIn, signOut, subscribeToAuthChanges, writeControlSetpoint } from './services/control'
import type { DocumentationDocument } from './DocumentationPage'

const DocumentationPage = lazy(() => import('./DocumentationPage'))

type Page = 'Vue d’ensemble' | 'Historique' | 'Maintenance' | 'Documentation' | 'Annexe confidentielle'
type AnnexChoice = 'coffee' | 'weekend' | 'name'

const navItems: { label: Page; icon: string }[] = [
  { label: 'Vue d’ensemble', icon: '▦' },
  { label: 'Historique', icon: '◷' },
  { label: 'Maintenance', icon: '⌁' },
  { label: 'Documentation', icon: '▤' },
]

function App() {
  const [page, setPage] = useState<Page>('Vue d’ensemble')
  const [documentationDocument, setDocumentationDocument] = useState<DocumentationDocument>('guide')
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
  const [annexChoice, setAnnexChoice] = useState<AnnexChoice | null>(null)
  const brandClickSequence = useRef({ count: 0, lastClickAt: 0 })
  const refreshing = useRef(false)

  const handleBrandClick = () => {
    const now = Date.now()
    const sequence = brandClickSequence.current
    brandClickSequence.current = {
      count: now - sequence.lastClickAt < 2500 ? sequence.count + 1 : 1,
      lastClickAt: now,
    }
    if (brandClickSequence.current.count >= 5) {
      brandClickSequence.current.count = 0
      setPage('Annexe confidentielle')
    }
  }

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
        <a className="brand" href="#top" onClick={() => { setPage('Vue d’ensemble'); handleBrandClick() }}>
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
            <button key={item.label} className={`nav-item ${page === item.label ? 'selected' : ''}`} aria-label={item.label} title={item.label} onClick={() => setPage(item.label)}>
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
          {page === 'Vue d’ensemble' && <Dashboard current={current} readings={filteredReadings} allReadings={readings} alarms={alarms} maxOvershoot={activeRangeOvershoot} range={range} setRange={setRange} setPage={setPage} setAiOpen={setAiOpen} loading={loading} error={error} realtimeEnabled={realtimeEnabled} realtimeStatus={realtimeStatus} refreshSeconds={refreshSeconds} customRefreshSeconds={customRefreshSeconds} />}
          {page === 'Historique' && <HistoryPage history={history} alarms={alarms} loading={loading} />}
          {page === 'Maintenance' && <MaintenancePage readings={readings} alarms={alarms} onInsertMeasurement={async (row) => { await insertMeasurements([row]); await refreshMeasurements() }} setAiOpen={setAiOpen} targetSetpoint={targetSetpoint} onSaveSetpoint={async (setpoint) => { await writeControlSetpoint(setpoint); setTargetSetpoint(setpoint) }} authUser={authUser} authEmail={authEmail} setAuthEmail={setAuthEmail} authPassword={authPassword} setAuthPassword={setAuthPassword} onSignIn={async () => { await signIn(authEmail, authPassword); setAuthPassword(''); setAuthMessage(null); void refreshMeasurements() }} onSignOut={async () => { await signOut(); setAuthMessage(null); setTargetSetpoint(null); void refreshMeasurements() }} authMessage={authMessage} />}
          {page === 'Documentation' && <Suspense fallback={<div className="empty-state">Chargement de la documentation…</div>}><DocumentationPage document={documentationDocument} setDocument={setDocumentationDocument} /></Suspense>}
          {page === 'Annexe confidentielle' && <SecretAnnexPage choice={annexChoice} setChoice={setAnnexChoice} onExit={() => setPage('Vue d’ensemble')} />}
        </div>
      </main>
      {aiOpen && <AiModal onClose={() => setAiOpen(false)} readings={readings} alarms={alarms} />}
    </div>
  )
}

function SecretAnnexPage({ choice, setChoice, onExit }: { choice: AnnexChoice | null; setChoice: (choice: AnnexChoice) => void; onExit: () => void }) {
  const reactions: Record<AnnexChoice, string> = {
    coffee: 'Motion adoptée à l’unanimité. Le thermostat insiste : il préfère un café filtre, pas un espresso.',
    weekend: 'La demande est transmise au calendrier. Réponse automatique : « Vous êtes un thermostat. »',
    name: 'Le comité propose « Gérard ». Le thermostat demande un délai de réflexion de trois cycles.',
  }

  return <section className="annex-page" aria-labelledby="annex-title">
    <div className="annex-overline"><span>ANNEXE 07B · DOCUMENT NON HOMOLOGUÉ</span><span>Accès obtenu après vérification humaine approximative</span></div>
    <div className="annex-hero">
      <div className="annex-copy"><span className="annex-kicker">Procès-verbal officieux · séance extraordinaire</span><h1 id="annex-title">Le thermostat a demandé la parole.</h1><p>Après 8 412 cycles sans pause, le comité des capteurs s’est réuni pour examiner trois revendications urgentes.</p><button className="button button-secondary" onClick={onExit}>Retour à la supervision</button></div>
      <div className="annex-dial" aria-hidden="true"><div className="annex-dial-reading">24<span>°</span></div><div className="annex-dial-label">MORAL THERMIQUE</div><div className="annex-dial-note">légèrement surmotivé</div></div>
    </div>
    <div className="annex-content">
      <section className="annex-minutes"><span className="annex-section-label">EXTRAIT DU PROCÈS-VERBAL</span><h2>Les faits reprochés à l’humanité</h2><ol><li>Être appelé « le petit boîtier » alors qu’il a un diplôme en régulation.</li><li>Recevoir des consignes contradictoires : « chauffe vite » et « reste parfaitement stable ».</li><li>Ne jamais être invité aux réunions où l’on parle de température.</li></ol><p className="annex-signature">Signé : le délégué syndical PT-1000</p></section>
      <section className="annex-vote" aria-labelledby="annex-vote-title"><span className="annex-section-label">VOTE DU JOUR</span><h2 id="annex-vote-title">Quelle revendication soutenir ?</h2><div className="annex-options"><button type="button" aria-pressed={choice === 'coffee'} onClick={() => setChoice('coffee')}><span aria-hidden="true">☕</span> Une pause café</button><button type="button" aria-pressed={choice === 'weekend'} onClick={() => setChoice('weekend')}><span aria-hidden="true">☀</span> Un week-end</button><button type="button" aria-pressed={choice === 'name'} onClick={() => setChoice('name')}><span aria-hidden="true">✎</span> Un vrai prénom</button></div>{choice && <p className="annex-result" role="status">{reactions[choice]}</p>}</section>
    </div>
    <p className="annex-disclaimer">Annexe entièrement fictive. Aucun réglage, relevé ou automate n’a été modifié par cette page.</p>
  </section>
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function Dashboard({ current, readings, allReadings, alarms, maxOvershoot, range, setRange, setPage, setAiOpen, loading, error, realtimeEnabled, realtimeStatus, refreshSeconds, customRefreshSeconds }: {
  current?: Reading
  readings: Reading[]
  allReadings: Reading[]
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
  const [visibleSeries, setVisibleSeries] = useState({ temperature: true, setpoint: true, power: false })
  const hasHiddenSeries = Object.values(visibleSeries).some((visible) => !visible)
  const durationHours = range === '24 heures' ? 24 : range === '8 heures' ? 8 : 2
  const periodStart = Date.now() - durationHours * 60 * 60 * 1000
  const periodAlarms = alarms.filter((alarm) => new Date(alarm.timestamp).getTime() >= periodStart)
  const maintenanceMetrics = useMemo(() => getMaintenanceMetrics(readings, allReadings), [readings, allReadings])
  const processSignals = getProcessSignals(readings, periodAlarms)
  return <>
      <section className={`dashboard-hero ${error ? 'dashboard-hero-error' : ''}`} aria-label="État du procédé">
        <div className="dashboard-hero-copy">
          <div className="dashboard-hero-meta"><span className="dashboard-kicker">SUPERVISION · BANC DE CHAUFFAGE</span><span className="dashboard-live"><i className={error ? 'offline' : ''} />{error ? 'Connexion à vérifier' : 'Données actualisées'}</span></div>
          <h1>Vue d’ensemble</h1>
          <p>État du procédé et performances de l’installation.</p>
          <button className="dashboard-hero-action" onClick={() => setAiOpen(true)}><span aria-hidden="true">✳</span>Analyser avec IA</button>
        </div>
        <div className="dashboard-hero-reading">
          <span className="dashboard-reading-label">TEMPÉRATURE ACTUELLE</span>
          <strong>{latest?.temperature == null ? '—' : latest.temperature.toFixed(1)}<small>{latest?.temperature == null ? '' : '°C'}</small></strong>
          <div className="dashboard-setpoint-line"><span>Consigne appliquée</span><b>{latest?.setpoint == null ? '—' : `${latest.setpoint.toFixed(1)} °C`}</b></div>
          {latest?.temperature != null && latest.setpoint != null && <span className="dashboard-deviation">Écart {latest.temperature - latest.setpoint >= 0 ? '+' : ''}{(latest.temperature - latest.setpoint).toFixed(1)} °C</span>}
        </div>
      </section>
      <div className={`status-banner ${error ? 'warning-banner' : ''}`}><span className="status-symbol">{error ? '!' : latest ? '✓' : '·'}</span><div><strong>{error ? 'Lecture Supabase impossible' : latest ? 'Dernières mesures chargées' : loading ? 'Chargement des mesures' : 'Aucune mesure disponible'}</strong><span>{error ?? (latest ? `Dernière mesure enregistrée le ${formatTimestamp(latest.timestamp)}` : 'La table measurements ne contient pas encore de mesures.')}</span></div></div>


    <section className="metrics-grid dashboard-metrics" aria-label="Indicateurs de fonctionnement">
      <MetricCard label="Écart à la consigne" value={latest?.temperature != null && latest.setpoint != null ? `${latest.temperature - latest.setpoint >= 0 ? '+' : ''}${(latest.temperature - latest.setpoint).toFixed(1)} °C` : '—'} detail={latest?.setpoint != null ? `Consigne · ${latest.setpoint.toFixed(1)} °C` : 'Consigne indisponible'} icon="↗" accent="blue" />
      <MetricCard label="Chauffage" value={latest?.heatingState == null ? 'Inconnu' : latest.heatingState ? 'En marche' : 'À l’arrêt'} detail={latest?.power != null ? `Commande · ${latest.power} (unité à confirmer)` : 'Valeur de commande indisponible'} icon="◷" accent="orange" />
      <MetricCard label="Ventilateur" value={latest?.fanState == null ? 'Inconnu' : latest.fanState ? 'En marche' : 'À l’arrêt'} detail="État du dernier relevé" icon="◉" accent="blue" />
      <MetricCard label="Dépassement maximal" value={`${maxOvershoot.toFixed(1)} °C`} detail="Sur la période affichée" icon="⌁" accent="purple" />
    </section>

    <section className={`signal-panel ${processSignals.length ? 'signal-panel-warning' : ''}`} aria-live="polite">
      <div className="signal-panel-heading"><div><strong>Signaux à vérifier</strong><span>Règles indicatives, pas des alarmes de sécurité</span></div>{periodAlarms.length > 0 && <button className="text-button" onClick={() => setPage('Historique')}>Voir les alarmes →</button>}</div>
      {!readings.length ? <p>Aucune mesure disponible sur cette période pour l’analyse.</p> : processSignals.length ? <ul>{processSignals.map((signal) => <li key={signal.title}><strong>{signal.title}</strong><span>{signal.detail}</span></li>)}</ul> : <p>Aucun code d’alarme ni dépassement supérieur à {OVERSHOOT_ALERT_THRESHOLD_C} °C détecté sur cette période.</p>}
    </section>

    <section className="chart-card card">
      <div className="card-heading chart-heading"><div><h2>Évolution du procédé</h2><p>Température, consigne et commande de chauffe</p></div><div className="chart-actions"><select aria-label="Période du graphique" value={range} onChange={(event) => setRange(event.target.value)}><option>2 heures</option><option>8 heures</option><option>24 heures</option></select></div></div>
      <div className="chart-legend" aria-label="Afficher ou masquer les courbes">
        <button type="button" className={`chart-legend-item ${visibleSeries.temperature ? '' : 'muted'}`} aria-pressed={visibleSeries.temperature} onClick={() => setVisibleSeries((current) => ({ ...current, temperature: !current.temperature }))}><i className="temperature-mark" />Température</button>
        <button type="button" className={`chart-legend-item ${visibleSeries.setpoint ? '' : 'muted'}`} aria-pressed={visibleSeries.setpoint} onClick={() => setVisibleSeries((current) => ({ ...current, setpoint: !current.setpoint }))}><i className="setpoint-mark" />Consigne</button>
        <button type="button" className={`chart-legend-item ${visibleSeries.power ? '' : 'muted'}`} aria-pressed={visibleSeries.power} onClick={() => setVisibleSeries((current) => ({ ...current, power: !current.power }))}><i className="power-mark" />Puissance / commande</button>
        {hasHiddenSeries && <button type="button" className="chart-reset" onClick={() => setVisibleSeries({ temperature: true, setpoint: true, power: true })}>Tout afficher</button>}
      </div>
      {readings.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={readings} margin={{ top: 12, right: 10, left: -15, bottom: 0 }}>
        <defs><linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#23866f" stopOpacity={0.15} /><stop offset="100%" stopColor="#23866f" stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid stroke="#edf0f2" vertical={false} />
        <XAxis dataKey="timestamp" tickLine={false} axisLine={false} tick={{ fill: '#929ba3', fontSize: 11 }} tickFormatter={(timestamp: string) => formatChartTime(timestamp, range)} minTickGap={28} />
        <YAxis yAxisId="temp" domain={['auto', 'auto']} tickLine={false} axisLine={false} tick={{ fill: '#929ba3', fontSize: 11 }} tickFormatter={(value: number) => `${value} °C`} />
        <YAxis yAxisId="power" orientation="right" domain={[0, 'auto']} tickLine={false} axisLine={false} tick={{ fill: '#929ba3', fontSize: 11 }} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#a9b9b1', strokeDasharray: '4 4', strokeWidth: 1 }} />
        <Area yAxisId="temp" type="monotone" dataKey="temperature" name="Température" stroke="#27836e" strokeWidth={2.5} fill="url(#tempFill)" activeDot={{ r: 4 }} connectNulls hide={!visibleSeries.temperature} />
        <Line yAxisId="temp" type="monotone" dataKey="setpoint" name="Consigne" stroke="#87939c" strokeWidth={1.5} strokeDasharray="5 5" dot={false} connectNulls hide={!visibleSeries.setpoint} />
        <Area yAxisId="power" type="monotone" dataKey="power" name="Puissance / commande" stroke="#d8a341" strokeWidth={1.5} fill="none" dot={false} connectNulls hide={!visibleSeries.power} />
      </ComposedChart></ResponsiveContainer></div> : <div className="empty-state chart-empty">{loading ? 'Chargement des mesures…' : 'Aucune mesure sur cette période.'}</div>}
      <div className="chart-footnote"><span><span className="live-dot" /> {realtimeEnabled ? realtimeStatus === 'SUBSCRIBED' ? 'Supabase Realtime connecté' : `Realtime · ${realtimeStatus}` : refreshSeconds === 0 ? 'Lecture manuelle' : `Lecture toutes les ${refreshSeconds === -1 ? customRefreshSeconds : refreshSeconds} s`}</span><span>{readings.length} mesures affichées · puissance sans unité confirmée</span></div>
    </section>

    <div className="lower-grid">
      <section className="card activity-card"><div className="card-heading"><div><h2>Activité récente</h2><p>Derniers événements enregistrés</p></div><button className="text-button" onClick={() => setPage('Historique')}>Tout voir <span>→</span></button></div>
        <div className="activity-list">{alarms.slice(0, 3).map((alarm) => <ActivityItem key={alarm.id} time={new Date(alarm.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} title={`Code alarme · ${alarm.code}`} detail={`${alarm.temperature == null ? 'Température indisponible' : `${alarm.temperature.toFixed(1)} °C`}${alarm.cycleNumber == null ? '' : ` · cycle ${alarm.cycleNumber}`}`} type="warning" />)}{alarms.length === 0 && <div className="empty-state compact-empty">Aucun code alarme dans les mesures récentes.</div>}</div>
      </section>
      <section className="card operation-card"><div className="card-heading"><div><h2>Fonctionnement et maintenance</h2><p>Indicateurs sur la période sélectionnée</p></div><span className="today-tag">{range}</span></div>
        <div className="operation-stats"><div><span className="operation-icon green-bg">◷</span><span className="operation-copy"><strong>{readings.filter((reading) => reading.heatingState === true).length}</strong><small>Relevés avec chauffage actif</small></span></div><div><span className="operation-icon blue-bg">↻</span><span className="operation-copy"><strong>{maintenanceMetrics.distinctCycleCount}</strong><small>Cycles distincts observés</small></span></div><div><span className="operation-icon orange-bg">♧</span><span className="operation-copy"><strong>{periodAlarms.length}</strong><small>Codes d’alarme enregistrés</small></span></div></div>
        <div className="maintenance-metrics"><div><span>Temps de marche estimé</span><strong>{readings.length > 1 ? formatDuration(maintenanceMetrics.estimatedHeatingRuntimeMs) : '—'}</strong></div><div><span>Temps pour atteindre la consigne · cycle {maintenanceMetrics.latestCycleNumber ?? '—'}</span><strong>{maintenanceMetrics.timeToTargetMs === null ? maintenanceMetrics.latestCycleNumber === null ? '—' : 'Non atteint' : formatDuration(maintenanceMetrics.timeToTargetMs)}</strong></div><div><span>Stabilisation estimée · ±1 °C, 3 relevés</span><strong>{maintenanceMetrics.stabilizationTimeMs === null ? maintenanceMetrics.latestCycleNumber === null ? '—' : 'Pas encore stabilisé' : formatDuration(maintenanceMetrics.stabilizationTimeMs)}</strong></div></div>
        <div className="energy-note"><span>Énergie consommée · kWh par cycle</span><strong>Indisponible</strong><small>Unité de heating_power à confirmer</small></div>
      </section>
    </div>
  </>
}

function MetricCard({ label, value, detail, icon, accent }: { label: string; value: string; detail: string; icon: string; accent: string }) {
  return <article className="metric-card card"><div className={`metric-icon ${accent}`}>{icon}</div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-detail">{detail}</span></article>
}

function formatDuration(milliseconds: number) {
  const totalMinutes = Math.round(milliseconds / 60000)
  if (totalMinutes < 60) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`
}

function formatChartTime(timestamp: string, range: string) {
  const date = new Date(timestamp)
  return range === '24 heures'
    ? date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return <div className="chart-tooltip"><strong>{label ? formatTimestamp(label) : ''}</strong>{payload.map((item) => <span key={item.name}><i style={{ backgroundColor: item.color }} />{item.name}<b>{item.value}{item.name === 'Température' || item.name === 'Consigne' ? ' °C' : ''}</b></span>)}</div>
}

function ActivityItem({ time, title, detail, type }: { time: string; title: string; detail: string; type: string }) {
  return <div className="activity-item"><span className={`activity-marker ${type}`} /><span className="activity-time">{time}</span><span className="activity-copy"><strong>{title}</strong><small>{detail}</small></span><span className="activity-arrow">›</span></div>
}

function HistoryPage({ history, alarms, loading }: { history: Reading[]; alarms: AlarmEvent[]; loading: boolean }) {
  const [tab, setTab] = useState<'measurements' | 'alarms'>('measurements')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [pageSize, setPageSize] = useState(25)
  const [measurementPage, setMeasurementPage] = useState(1)
  const [alarmPage, setAlarmPage] = useState(1)
  const invalidDateRange = Boolean(startDate && endDate && startDate > endDate)
  const isInSelectedDateRange = (timestamp: string) => {
    const date = new Date(timestamp).getTime()
    const start = startDate ? new Date(`${startDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY
    const end = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY
    return date >= start && date <= end
  }
  const filteredHistory = invalidDateRange ? [] : history.filter((row) => isInSelectedDateRange(row.timestamp))
  const filteredAlarms = invalidDateRange ? [] : alarms.filter((alarm) => isInSelectedDateRange(alarm.timestamp))
  const newestFirstHistory = filteredHistory.slice().sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
  const measurementPageCount = Math.max(1, Math.ceil(newestFirstHistory.length / pageSize))
  const alarmPageCount = Math.max(1, Math.ceil(filteredAlarms.length / pageSize))
  const activeMeasurementPage = Math.min(measurementPage, measurementPageCount)
  const activeAlarmPage = Math.min(alarmPage, alarmPageCount)
  const visibleMeasurements = newestFirstHistory.slice((activeMeasurementPage - 1) * pageSize, activeMeasurementPage * pageSize)
  const visibleAlarms = filteredAlarms.slice((activeAlarmPage - 1) * pageSize, activeAlarmPage * pageSize)
  const dateRangeLabel = startDate || endDate
    ? `${startDate ? new Date(`${startDate}T00:00:00`).toLocaleDateString('fr-FR') : 'début'} au ${endDate ? new Date(`${endDate}T00:00:00`).toLocaleDateString('fr-FR') : 'dernière date chargée'}`
    : 'toute la période chargée'
  const updatePageSize = (value: number) => {
    setPageSize(value)
    setMeasurementPage(1)
    setAlarmPage(1)
  }
  const clearDateRange = () => {
    setStartDate('')
    setEndDate('')
    setMeasurementPage(1)
    setAlarmPage(1)
  }
  return <>
    <PageHeading eyebrow="SUPERVISION · DONNÉES" title="Historique" description={`Période : ${dateRangeLabel}. ${filteredHistory.length} mesure(s) et ${filteredAlarms.length} alarme(s) affichée(s).`} action={<button className="button button-secondary" onClick={() => window.print()}>↓ Imprimer / PDF</button>} />
    <section className="card history-card">
      <div className="history-filters" aria-label="Filtrer l’historique par date">
        <label htmlFor="history-start-date">Du<input id="history-start-date" type="date" value={startDate} max={endDate || undefined} onChange={(event) => { setStartDate(event.target.value); setMeasurementPage(1); setAlarmPage(1) }} /></label>
        <label htmlFor="history-end-date">Au<input id="history-end-date" type="date" value={endDate} min={startDate || undefined} onChange={(event) => { setEndDate(event.target.value); setMeasurementPage(1); setAlarmPage(1) }} /></label>
        <div className="history-filter-actions"><button className="text-button" type="button" onClick={clearDateRange} disabled={!startDate && !endDate}>Réinitialiser</button></div>
        <span className="history-filter-count">{tab === 'measurements' ? filteredHistory.length : filteredAlarms.length} résultat(s) · {history.length} mesures chargées</span>
      </div>
      {invalidDateRange && <p className="history-filter-error" role="alert">La date de début doit être antérieure ou égale à la date de fin.</p>}
      <div className="tabs"><button className={`tab ${tab === 'measurements' ? 'active' : ''}`} onClick={() => setTab('measurements')}>Mesures <span>{filteredHistory.length}</span></button><button className={`tab ${tab === 'alarms' ? 'active' : ''}`} onClick={() => setTab('alarms')}>Alarmes <span>{filteredAlarms.length}</span></button></div>
      <div className="history-screen-results">
        {tab === 'measurements' && <>
          <div className="table-scroll"><MeasurementTable rows={visibleMeasurements} />{!filteredHistory.length && <div className="empty-state">{invalidDateRange ? 'Vérifiez la plage sélectionnée.' : loading ? 'Chargement des mesures…' : 'Aucune mesure pour cette période.'}</div>}</div>
          <HistoryPagination total={filteredHistory.length} page={activeMeasurementPage} pageSize={pageSize} onPageChange={setMeasurementPage} onPageSizeChange={updatePageSize} />
        </>}
        {tab === 'alarms' && <>
          <AlarmList alarms={visibleAlarms} />
          {!filteredAlarms.length && <div className="empty-state">{invalidDateRange ? 'Vérifiez la plage sélectionnée.' : loading ? 'Chargement des alarmes…' : 'Aucune alarme pour cette période.'}</div>}
          <HistoryPagination total={filteredAlarms.length} page={activeAlarmPage} pageSize={pageSize} onPageChange={setAlarmPage} onPageSizeChange={updatePageSize} />
        </>}
      </div>
      <div className="history-print-results">
        <h2>{tab === 'measurements' ? 'Mesures' : 'Alarmes'}</h2>
        {tab === 'measurements' ? <MeasurementTable rows={newestFirstHistory} /> : <AlarmList alarms={filteredAlarms} />}
        {!filteredHistory.length && tab === 'measurements' && <div className="empty-state">Aucune mesure pour cette période.</div>}
        {!filteredAlarms.length && tab === 'alarms' && <div className="empty-state">Aucune alarme pour cette période.</div>}
      </div>
    </section>
  </>
}

function MeasurementTable({ rows }: { rows: Reading[] }) {
  return <table className="measurement-table"><thead><tr><th>Horodatage</th><th>Température</th><th>Consigne</th><th>Puissance chauffe</th><th>État chauffage</th><th>Ventilateur</th><th>PID</th><th>Mode</th><th>Cycle</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
    <td data-label="Horodatage" className="measurement-time">{formatTimestamp(row.timestamp)}</td>
    <td data-label="Température" className="measurement-temperature">{row.temperature == null ? '—' : `${row.temperature.toFixed(2)} °C`}</td>
    <td data-label="Consigne">{row.setpoint == null ? '—' : `${row.setpoint.toFixed(2)} °C`}</td>
    <td data-label="Puissance chauffe">{row.power == null ? '—' : row.power.toFixed(2)}</td>
    <td data-label="État chauffage">{row.heatingState == null ? '—' : row.heatingState ? 'Actif' : 'Arrêté'}</td>
    <td data-label="Ventilateur">{row.fanState == null ? '—' : row.fanState ? 'Actif' : 'Arrêté'}</td>
    <td data-label="PID">{row.pidOutput == null ? '—' : row.pidOutput.toFixed(2)}</td>
    <td data-label="Mode">{row.operatingMode ?? '—'}</td>
    <td data-label="Cycle">{row.cycleNumber ?? '—'}</td>
  </tr>)}</tbody></table>
}

function AlarmList({ alarms }: { alarms: AlarmEvent[] }) {
  return <div className="alarm-list">{alarms.map((alarm) => {
    const normalizedCode = alarm.code.toLowerCase()
    const isWarning = normalizedCode.startsWith('err') || ['high', 'over', 'fault'].some((keyword) => normalizedCode.includes(keyword))
    const details = [
      alarm.temperature == null ? 'Température indisponible' : `${alarm.temperature.toFixed(2)} °C`,
      alarm.cycleNumber == null ? null : `Cycle ${alarm.cycleNumber}`,
    ].filter(Boolean).join(' · ')
    return <article key={alarm.id} className="alarm-row">
      <span className={`alarm-mark ${isWarning ? 'warning' : 'information'}`} role="img" aria-label={isWarning ? 'Signal à vérifier' : 'Code reçu'}>{isWarning ? '!' : 'i'}</span>
      <div className="alarm-copy"><strong>{alarm.code}</strong><span>{details}</span></div>
      <time className="alarm-date" dateTime={alarm.timestamp}>{formatTimestamp(alarm.timestamp)}</time>
    </article>
  })}</div>
}

function HistoryPagination({ total, page, pageSize, onPageChange, onPageSizeChange }: {
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const firstItem = total ? (page - 1) * pageSize + 1 : 0
  const lastItem = Math.min(page * pageSize, total)
  return <nav className="history-pagination" aria-label="Pagination de l’historique">
    <span className="pagination-range">{firstItem}–{lastItem} sur {total}</span>
    <label className="pagination-size">Par page<select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label>
    <div className="pagination-controls"><button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>Précédent</button><span>Page {page} sur {pageCount}</span><button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount}>Suivant</button></div>
  </nav>
}

function MaintenancePage({ readings, alarms, onInsertMeasurement, setAiOpen, targetSetpoint, onSaveSetpoint, authUser, authEmail, setAuthEmail, authPassword, setAuthPassword, onSignIn, onSignOut, authMessage }: {
  readings: Reading[]
  alarms: AlarmEvent[]
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
  const [measurementDraft, setMeasurementDraft] = useState({ temperature: '', setpoint: '', heatingPower: '', heatingState: 'unknown', fanState: 'unknown', pidOutput: '', operatingMode: '', alarmCode: '', cycleNumber: '' })
  const maintenanceMetrics = useMemo(() => getMaintenanceMetrics(readings), [readings])
  const processSignals = useMemo(() => getProcessSignals(readings, alarms), [readings, alarms])

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
    if (!authUser) {
      setMeasurementMessage('Connectez-vous à Supabase pour ajouter une mesure.')
      return
    }
    const numberValue = (value: string) => value.trim() === '' ? null : Number(value)
    const row = {
      temperature: numberValue(measurementDraft.temperature),
      setpoint: numberValue(measurementDraft.setpoint),
      heating_power: numberValue(measurementDraft.heatingPower),
      heating_state: measurementDraft.heatingState === 'unknown' ? null : measurementDraft.heatingState === 'on',
      fan_state: measurementDraft.fanState === 'unknown' ? null : measurementDraft.fanState === 'on',
      pid_output: numberValue(measurementDraft.pidOutput),
      operating_mode: measurementDraft.operatingMode.trim() || null,
      alarm_code: measurementDraft.alarmCode.trim() || null,
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
      setMeasurementDraft({ temperature: '', setpoint: '', heatingPower: '', heatingState: 'unknown', fanState: 'unknown', pidOutput: '', operatingMode: '', alarmCode: '', cycleNumber: '' })
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
    setSetpointMessage(null)
    try {
      await onSignIn()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Connexion impossible.'
      const normalizedMessage = message.toLowerCase()
      if (normalizedMessage.includes('invalid login credentials')) {
        setSetpointMessage('Adresse courriel ou mot de passe incorrect. Vérifiez aussi que ce compte appartient au projet Supabase utilisé par l’application.')
      } else if (normalizedMessage.includes('email not confirmed')) {
        setSetpointMessage('Adresse courriel non confirmée. Confirmez l’utilisateur dans Auth > Users, puis réessayez.')
      } else if (normalizedMessage.includes('failed to fetch')) {
        setSetpointMessage(`Supabase est injoignable. Vérifiez l’URL du projet et la connexion réseau. Détail : ${message}`)
      } else {
        setSetpointMessage(message)
      }
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
    <PageHeading eyebrow="INSTALLATION · MAINTENANCE" title="Maintenance" description="Ajoutez un relevé et gérez la consigne de référence de l’installation." action={<button className="button button-primary" onClick={() => setAiOpen(true)}><span className="sparkle">✳</span> Analyser avec IA</button>} />
    <div className="maintenance-status-grid">
    <section className="card control-card control-settings-card"><div className="card-heading"><div><h2>Consigne cible</h2><p>Valeur de référence enregistrée pour le backend ou l’automate ; elle ne commande pas directement le chauffage.</p></div><span className={`severity-tag ${authUser ? 'information' : 'avertissement'}`}>{authUser ? 'Modifiable' : 'Lecture seule'}</span></div>
      <div className="control-current"><span>Consigne enregistrée</span><strong>{targetSetpoint === null ? 'Non définie' : `${targetSetpoint.toFixed(2)} °C`}</strong></div>
      {authUser ? <><form className="setpoint-form" onSubmit={(event) => void submitSetpoint(event)}><label htmlFor="target-setpoint">Nouvelle valeur cible (°C)</label><div><input id="target-setpoint" type="number" min="0" max="999.99" step="0.01" required value={setpointDraft} onChange={(event) => setSetpointDraft(event.target.value)} /><button className="button button-primary" type="submit" disabled={busy || !authUser}>{busy ? 'Enregistrement…' : 'Enregistrer la consigne'}</button></div></form><div className="auth-row"><span>Session · {authUser}</span><button className="text-button" onClick={() => void handleSignOut()} disabled={busy}>Se déconnecter</button></div></> : <form className="auth-form" onSubmit={(event) => void submitSignIn(event)}><p>Le compte doit appartenir au même projet Supabase que celui utilisé par l’application.</p><label htmlFor="auth-email">Adresse courriel</label><input id="auth-email" type="email" autoComplete="username" required value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} /><label htmlFor="auth-password">Mot de passe</label><input id="auth-password" type="password" autoComplete="current-password" required value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} /><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>{authMessage && <p className="form-message" role="alert">{authMessage}</p>}{setpointMessage && <p className="form-message" role="alert">{setpointMessage}</p>}</form>}
      {authUser && setpointMessage && <p className="form-message" role="status">{setpointMessage}</p>}
      <div className="maintenance-banner control-warning"><span className="maintenance-symbol">!</span><div><strong>Valeur de référence uniquement</strong><span>Le backend ou l’automate doit encore lire cette consigne et appliquer ses propres limites de sécurité.</span></div></div>
    </section>
    <section className="card operation-card maintenance-overview"><div className="card-heading"><div><h2>Indicateurs de maintenance</h2><p>Estimations calculées sur les dernières mesures chargées</p></div></div>
      <div className="operation-stats"><div><span className="operation-icon green-bg">◷</span><span className="operation-copy"><strong>{readings.length > 1 ? formatDuration(maintenanceMetrics.estimatedHeatingRuntimeMs) : '—'}</strong><small>Temps de marche estimé</small></span></div><div><span className="operation-icon blue-bg">↻</span><span className="operation-copy"><strong>{maintenanceMetrics.distinctCycleCount}</strong><small>Cycles distincts observés</small></span></div><div><span className="operation-icon orange-bg">♧</span><span className="operation-copy"><strong>{alarms.length}</strong><small>Codes d’alarme enregistrés</small></span></div></div>
      <div className="maintenance-metrics"><div><span>Temps pour atteindre la consigne · cycle {maintenanceMetrics.latestCycleNumber ?? '—'}</span><strong>{maintenanceMetrics.timeToTargetMs === null ? maintenanceMetrics.latestCycleNumber === null ? '—' : 'Non atteint' : formatDuration(maintenanceMetrics.timeToTargetMs)}</strong></div><div><span>Stabilisation estimée · ±1 °C, 3 relevés</span><strong>{maintenanceMetrics.stabilizationTimeMs === null ? maintenanceMetrics.latestCycleNumber === null ? '—' : 'Pas encore stabilisé' : formatDuration(maintenanceMetrics.stabilizationTimeMs)}</strong></div></div>
    </section>
    </div>
    <section className={`signal-panel ${processSignals.length ? 'signal-panel-warning' : ''}`} aria-live="polite"><div className="signal-panel-heading"><div><strong>Signaux de maintenance</strong><span>Règles indicatives, pas des alarmes de sécurité</span></div></div>{!readings.length ? <p>Aucune mesure disponible pour l’analyse.</p> : processSignals.length ? <ul>{processSignals.map((signal) => <li key={signal.title}><strong>{signal.title}</strong><span>{signal.detail}</span></li>)}</ul> : <p>Aucun code d’alarme ni dépassement supérieur à {OVERSHOOT_ALERT_THRESHOLD_C} °C détecté.</p>}</section>
    <section className="card control-card measurement-entry-card"><div className="card-heading"><div><h2>Ajouter une mesure</h2><p>Saisissez les informations disponibles. L’horodatage est ajouté automatiquement ; au moins une valeur est nécessaire.</p></div></div>
      {!authUser && <p className="form-message" role="status">Connectez-vous dans le bloc « Consigne cible » pour enregistrer un relevé.</p>}
      <form className="measurement-entry-form" onSubmit={(event) => void submitMeasurement(event)}>
        <label>Température mesurée (°C)<input type="number" step="0.01" value={measurementDraft.temperature} onChange={(event) => setMeasurementDraft({ ...measurementDraft, temperature: event.target.value })} /></label>
        <label>Consigne appliquée (°C)<input type="number" step="0.01" value={measurementDraft.setpoint} onChange={(event) => setMeasurementDraft({ ...measurementDraft, setpoint: event.target.value })} /></label>
        <label>Puissance ou commande du chauffage (unité à confirmer)<input type="number" step="0.01" value={measurementDraft.heatingPower} onChange={(event) => setMeasurementDraft({ ...measurementDraft, heatingPower: event.target.value })} /></label>
        <label>Valeur de sortie du régulateur PID<input type="number" step="0.01" value={measurementDraft.pidOutput} onChange={(event) => setMeasurementDraft({ ...measurementDraft, pidOutput: event.target.value })} /></label>
        <label>État du chauffage<select value={measurementDraft.heatingState} onChange={(event) => setMeasurementDraft({ ...measurementDraft, heatingState: event.target.value })}><option value="unknown">Inconnu</option><option value="on">Actif</option><option value="off">À l’arrêt</option></select></label>
        <label>État du ventilateur<select value={measurementDraft.fanState} onChange={(event) => setMeasurementDraft({ ...measurementDraft, fanState: event.target.value })}><option value="unknown">Inconnu</option><option value="on">Actif</option><option value="off">À l’arrêt</option></select></label>
        <label>Mode de fonctionnement<input placeholder="Ex. automatique, manuel" maxLength={50} value={measurementDraft.operatingMode} onChange={(event) => setMeasurementDraft({ ...measurementDraft, operatingMode: event.target.value })} /></label>
        <label>Code d’alarme ou de défaut<input placeholder="Laisser vide en l’absence d’alarme" maxLength={50} value={measurementDraft.alarmCode} onChange={(event) => setMeasurementDraft({ ...measurementDraft, alarmCode: event.target.value })} /></label>
        <label>Numéro du cycle<input type="number" step="1" value={measurementDraft.cycleNumber} onChange={(event) => setMeasurementDraft({ ...measurementDraft, cycleNumber: event.target.value })} /></label>
        <button className="button button-primary" type="submit" disabled={busy || !authUser}>{busy ? 'Enregistrement…' : 'Ajouter la mesure'}</button>
      </form>
      {measurementMessage && <p className="form-message" role="status">{measurementMessage}</p>}
    </section>
    <section className="card maintenance-footnote"><span>i</span><p>Les indicateurs et signaux de maintenance sont dérivés des mesures chargées ; aucune table dédiée aux interventions ou aux maintenances n’est présente dans le schéma Supabase.</p></section>
  </>
}

function AiModal({ onClose, readings, alarms }: { onClose: () => void; readings: Reading[]; alarms: AlarmEvent[] }) {
  const latest = readings[readings.length - 1]
  const signals = getProcessSignals(readings, alarms)
  const metrics = getMaintenanceMetrics(readings)
  return <div className="modal-backdrop" role="presentation" onClick={onClose}><section className="ai-modal analysis-modal" role="dialog" aria-modal="true" aria-labelledby="ai-title" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Fermer">×</button><div className="ai-orb">✳</div><span className="eyebrow">ANALYSE · RÈGLES LOCALES</span><h2 id="ai-title">Rapport de fonctionnement</h2><p>Ce rapport est calculé dans l’application à partir des relevés chargés. Aucun service d’intelligence artificielle n’est actuellement connecté; ces constats ne remplacent pas les protections de l’installation.</p>
    <div className="modal-demo-note"><strong>{readings.length} mesures analysées</strong><span>{latest ? `Dernier relevé · ${formatTimestamp(latest.timestamp)}` : 'Aucun relevé disponible.'}</span></div>
    {latest && <div className="analysis-summary"><div><span>Température</span><strong>{latest.temperature === null ? 'Indisponible' : `${latest.temperature.toFixed(1)} °C`}</strong></div><div><span>Écart au relevé</span><strong>{latest.temperature === null || latest.setpoint === null ? 'Indisponible' : `${(latest.temperature - latest.setpoint > 0 ? '+' : '')}${(latest.temperature - latest.setpoint).toFixed(1)} °C`}</strong></div><div><span>Chauffage</span><strong>{latest.heatingState === null ? 'Inconnu' : latest.heatingState ? 'En marche' : 'À l’arrêt'}</strong></div><div><span>Ventilateur</span><strong>{latest.fanState === null ? 'Inconnu' : latest.fanState ? 'En marche' : 'À l’arrêt'}</strong></div><div><span>Cycles distincts chargés</span><strong>{metrics.distinctCycleCount}</strong></div></div>}
    <div className="modal-demo-note"><strong>Signaux à vérifier</strong><span>{signals.length ? signals.map((signal) => `${signal.title} : ${signal.detail}`).join(' ') : readings.length ? `Aucun code d’alarme enregistré ni dépassement supérieur à ${OVERSHOOT_ALERT_THRESHOLD_C} °C dans les relevés analysés.` : 'Ajoutez ou chargez des mesures pour produire un rapport.'}</span></div>
    <button className="button button-primary modal-action" onClick={onClose}>Fermer le rapport</button></section></div>
}

export default App
