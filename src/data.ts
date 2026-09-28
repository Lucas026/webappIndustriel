import type { Measurement } from './lib/database.types'

export type Reading = {
  id: number
  timestamp: string
  time: string
  temperature: number | null
  setpoint: number | null
  power: number | null
  heatingState: boolean | null
  fanState: boolean | null
  pidOutput: number | null
  operatingMode: string | null
  alarmCode: string | null
  cycleNumber: number | null
}

export type AlarmEvent = {
  id: number
  timestamp: string
  code: string
  temperature: number | null
  cycleNumber: number | null
}

export type MaintenanceMetrics = {
  estimatedHeatingRuntimeMs: number
  distinctCycleCount: number
  latestCycleNumber: number | null
  timeToTargetMs: number | null
  stabilizationTimeMs: number | null
}

export type ProcessSignal = {
  title: string
  detail: string
}

export const OVERSHOOT_ALERT_THRESHOLD_C = 1
const CYCLE_TARGET_TOLERANCE_C = 1
const STABLE_READING_COUNT = 3

export function mapMeasurement(measurement: Measurement): Reading {
  return {
    id: measurement.id,
    timestamp: measurement.timestamp,
    time: new Date(measurement.timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    temperature: measurement.temperature,
    setpoint: measurement.setpoint,
    power: measurement.heating_power,
    heatingState: measurement.heating_state,
    fanState: measurement.fan_state,
    pidOutput: measurement.pid_output,
    operatingMode: measurement.operating_mode,
    alarmCode: measurement.alarm_code,
    cycleNumber: measurement.cycle_number,
  }
}

export function getAlarmEvents(readings: Reading[]): AlarmEvent[] {
  return readings
    .filter((reading) => reading.alarmCode)
    .map((reading) => ({
      id: reading.id,
      timestamp: reading.timestamp,
      code: reading.alarmCode!,
      temperature: reading.temperature,
      cycleNumber: reading.cycleNumber,
    }))
    .reverse()
}

export function getMaintenanceMetrics(readings: Reading[], cycleHistory: Reading[] = readings): MaintenanceMetrics {
  const timedReadings = readings
    .map((reading) => ({ reading, time: Date.parse(reading.timestamp) }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((left, right) => left.time - right.time)
  const timedCycleHistory = cycleHistory
    .map((reading) => ({ reading, time: Date.parse(reading.timestamp) }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((left, right) => left.time - right.time)
  const intervals = timedReadings.slice(1)
    .map((entry, index) => entry.time - timedReadings[index].time)
    .filter((interval) => interval > 0)
  const sortedIntervals = intervals.slice().sort((left, right) => left - right)
  const medianInterval = sortedIntervals.length
    ? sortedIntervals[Math.floor(sortedIntervals.length / 2)]
    : 0
  const maximumRuntimeGap = medianInterval * 2
  let estimatedHeatingRuntimeMs = 0

  timedReadings.slice(1).forEach((entry, index) => {
    const previous = timedReadings[index]
    const interval = entry.time - previous.time
    if (previous.reading.heatingState === true && entry.reading.heatingState === true && interval > 0 && interval <= maximumRuntimeGap) {
      estimatedHeatingRuntimeMs += interval
    }
  })

  const distinctCycleCount = new Set(readings
    .map((reading) => reading.cycleNumber)
    .filter((cycleNumber): cycleNumber is number => cycleNumber !== null))
    .size
  const latestReading = timedCycleHistory[timedCycleHistory.length - 1]?.reading
  const latestCycleNumber = latestReading?.cycleNumber ?? null

  if (latestCycleNumber === null) {
    return { estimatedHeatingRuntimeMs, distinctCycleCount, latestCycleNumber, timeToTargetMs: null, stabilizationTimeMs: null }
  }

  const latestCycleRows: Array<{ reading: Reading; time: number }> = []
  for (let index = timedCycleHistory.length - 1; index >= 0; index -= 1) {
    const entry = timedCycleHistory[index]
    if (entry.reading.cycleNumber !== latestCycleNumber) break
    latestCycleRows.unshift(entry)
  }
  const firstCycleSample = latestCycleRows.find(({ reading }) => reading.temperature !== null && reading.setpoint !== null)
  if (!firstCycleSample) {
    return { estimatedHeatingRuntimeMs, distinctCycleCount, latestCycleNumber, timeToTargetMs: null, stabilizationTimeMs: null }
  }

  const targetReading = latestCycleRows.find(({ reading, time }) => (
    time >= firstCycleSample.time
    && reading.temperature !== null
    && reading.setpoint !== null
    && reading.temperature >= reading.setpoint - CYCLE_TARGET_TOLERANCE_C
  ))
  let stableReadingCount = 0
  let stabilizationTimeMs: number | null = null
  for (const { reading, time } of latestCycleRows) {
    if (time < firstCycleSample.time || reading.temperature === null || reading.setpoint === null) {
      stableReadingCount = 0
      continue
    }
    if (Math.abs(reading.temperature - reading.setpoint) <= CYCLE_TARGET_TOLERANCE_C) {
      stableReadingCount += 1
      if (stableReadingCount === STABLE_READING_COUNT) {
        stabilizationTimeMs = time - firstCycleSample.time
        break
      }
    } else {
      stableReadingCount = 0
    }
  }

  return {
    estimatedHeatingRuntimeMs,
    distinctCycleCount,
    latestCycleNumber,
    timeToTargetMs: targetReading ? targetReading.time - firstCycleSample.time : null,
    stabilizationTimeMs,
  }
}

export function getProcessSignals(readings: Reading[], alarms: AlarmEvent[]): ProcessSignal[] {
  const signals: ProcessSignal[] = []
  const maximumOvershoot = Math.max(0, ...readings.flatMap((reading) => (
    reading.temperature !== null && reading.setpoint !== null
      ? [reading.temperature - reading.setpoint]
      : []
  )))

  if (alarms.length) {
    signals.push({
      title: `${alarms.length} code${alarms.length > 1 ? 's' : ''} d’alarme enregistré${alarms.length > 1 ? 's' : ''}`,
      detail: `Dernier code : ${alarms[0].code}. À interpréter selon la documentation de l’installation.`,
    })
  }
  if (maximumOvershoot > OVERSHOOT_ALERT_THRESHOLD_C) {
    signals.push({
      title: 'Dépassement de consigne à vérifier',
      detail: `Le dépassement maximal atteint ${maximumOvershoot.toFixed(1)} °C; seuil indicatif : ${OVERSHOOT_ALERT_THRESHOLD_C} °C.`,
    })
  }

  return signals
}

export function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
