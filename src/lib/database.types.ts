export type Measurement = {
  id: number
  timestamp: string
  temperature: number | null
  setpoint: number | null
  heating_power: number | null
  heating_state: boolean | null
  fan_state: boolean | null
  pid_output: number | null
  operating_mode: string | null
  alarm_code: string | null
  cycle_number: number | null
}

export type Database = {
  public: {
    Tables: {
      measurements: {
        Row: Measurement
        Insert: {
          id?: number
          timestamp?: string
          temperature?: number | null
          setpoint?: number | null
          heating_power?: number | null
          heating_state?: boolean | null
          fan_state?: boolean | null
          pid_output?: number | null
          operating_mode?: string | null
          alarm_code?: string | null
          cycle_number?: number | null
        }
        Update: Partial<Measurement>
        Relationships: []
      }
      control_settings: {
        Row: {
          id: number
          setpoint: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: number
          setpoint: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: number
          setpoint?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
