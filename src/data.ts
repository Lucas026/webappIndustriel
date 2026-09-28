export type Reading = {
  time: string
  temperature: number
  setpoint: number
  power: number
}

export type Alarm = {
  time: string
  title: string
  detail: string
  severity: 'Critique' | 'Avertissement' | 'Information'
  active: boolean
}

const initialTime = Date.now()

export const initialReadings: Reading[] = Array.from({ length: 24 }, (_, index) => {
  const minutesAgo = (23 - index) * 5
  const temperature = 63 + Math.sin(index / 3.1) * 5 + index * 0.28
  return {
    time: new Date(initialTime - minutesAgo * 60_000).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    temperature: Number(temperature.toFixed(1)),
    setpoint: 72,
    power: Math.max(0, Math.min(100, Math.round(88 - index * 2.3 + Math.cos(index) * 7))),
  }
})

export const alarms: Alarm[] = [
  {
    time: 'Aujourd’hui, 10:42',
    title: 'Dépassement de température',
    detail: 'Température supérieure de 2,4 °C à la consigne',
    severity: 'Avertissement',
    active: true,
  },
  {
    time: 'Aujourd’hui, 09:18',
    title: 'Temps de montée élevé',
    detail: 'Cycle C-024 · 8 min au-dessus du seuil indicatif',
    severity: 'Information',
    active: false,
  },
  {
    time: 'Hier, 16:07',
    title: 'Écart de sonde détecté',
    detail: 'Écart de 1,8 °C entre les mesures T1 et T2',
    severity: 'Critique',
    active: false,
  },
]

export const historyRows = [
  { cycle: 'C-026', start: 'Aujourd’hui, 10:12', duration: '18 min', peak: '73,8 °C', result: 'Terminé' },
  { cycle: 'C-025', start: 'Aujourd’hui, 09:34', duration: '21 min', peak: '72,9 °C', result: 'Terminé' },
  { cycle: 'C-024', start: 'Aujourd’hui, 09:02', duration: '26 min', peak: '74,4 °C', result: 'Alerte' },
  { cycle: 'C-023', start: 'Aujourd’hui, 08:21', duration: '19 min', peak: '72,6 °C', result: 'Terminé' },
  { cycle: 'C-022', start: 'Hier, 16:42', duration: '20 min', peak: '73,1 °C', result: 'Terminé' },
]
