import { supabase } from '../lib/supabase'
import type { Measurement } from '../lib/database.types'

type MeasurementInsert = Omit<Measurement, 'id'> & { id?: number }

export async function insertMeasurements(rows: Array<Partial<MeasurementInsert>>) {
  if (!supabase) throw new Error('Supabase n’est pas configuré.')
  const { data, error } = await supabase.from('measurements').insert(rows).select()
  if (error) throw error
  return data
}
