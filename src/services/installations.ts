import { supabase } from '../lib/supabase'
import type { Measurement } from '../lib/database.types'

const measurementColumns = 'id, timestamp, temperature, setpoint, heating_power, heating_state, fan_state, pid_output, operating_mode, alarm_code, cycle_number'

export async function getMeasurements(options: { limit?: number; since?: string } = {}) {
  if (!supabase) throw new Error('Supabase n’est pas configuré. Renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local.')

  const limit = options.limit ?? 500
  let query = supabase
    .from('measurements')
    .select(measurementColumns)
    .order('timestamp', { ascending: false })
    .limit(limit)

  if (options.since) query = query.gte('timestamp', options.since)

  const { data, error } = await query
  if (error) throw error
  return (data as Measurement[]).reverse()
}

export function subscribeToMeasurements(onChange: () => void, onStatus: (status: string) => void) {
  if (!supabase) {
    onStatus('CHANNEL_ERROR')
    return () => undefined
  }

  const channel = supabase
    .channel('industrial-control-live-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'measurements' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'control_settings' }, onChange)
    .subscribe((status) => onStatus(status))

  return () => {
    void supabase?.removeChannel(channel)
  }
}
