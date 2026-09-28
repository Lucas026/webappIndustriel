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
