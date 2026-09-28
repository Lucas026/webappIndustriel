import { supabase } from '../lib/supabase'

export async function getCurrentUserEmail() {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data.user?.email ?? null
}

export function subscribeToAuthChanges(onChange: (email: string | null) => void) {
  if (!supabase) return () => undefined
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    onChange(session?.user.email ?? null)
  })
  return () => subscription.unsubscribe()
}

export async function readControlSetpoint() {
  if (!supabase) throw new Error('Supabase n’est pas configuré.')
  const { data, error } = await supabase
    .from('control_settings')
    .select('setpoint')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw error
  return data?.setpoint ?? null
}

export async function writeControlSetpoint(setpoint: number) {
  if (!supabase) throw new Error('Supabase n’est pas configuré.')
  if (setpoint < 0 || setpoint > 999.99 || Math.round(setpoint * 100) !== setpoint * 100) {
    throw new Error('La consigne doit être comprise entre 0 et 999,99 °C avec au plus deux décimales.')
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Connectez-vous avec un compte Supabase avant de modifier la consigne cible.')

  const { error } = await supabase.from('control_settings').upsert({
    id: 1,
    setpoint,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }, { onConflict: 'id' })
  if (error) throw error
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Supabase n’est pas configuré.')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signOut() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
