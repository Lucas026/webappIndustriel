create table if not exists public.measurements (
  id bigserial primary key,
  "timestamp" timestamptz not null default now(),
  temperature numeric(5, 2),
  setpoint numeric(5, 2),
  heating_power numeric(5, 2),
  heating_state boolean,
  fan_state boolean,
  pid_output numeric(5, 2),
  operating_mode varchar(50),
  alarm_code varchar(50),
  cycle_number integer
);

create index if not exists idx_measurements_timestamp
  on public.measurements ("timestamp" desc);

create table if not exists public.control_settings (
  id smallint primary key default 1 check (id = 1),
  setpoint numeric(5, 2) not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.control_settings enable row level security;

drop policy if exists "Authenticated users can read control settings" on public.control_settings;
drop policy if exists "Public can read control settings" on public.control_settings;
drop policy if exists "Authenticated users can set control target" on public.control_settings;
drop policy if exists "Authenticated users can insert control target" on public.control_settings;
drop policy if exists "Authenticated users can update control target" on public.control_settings;

create policy "Public can read control settings"
  on public.control_settings for select to anon, authenticated using (true);

create policy "Authenticated users can insert control target"
  on public.control_settings for insert to authenticated
  with check (updated_by = (select auth.uid()));

create policy "Authenticated users can update control target"
  on public.control_settings for update to authenticated
  using (true) with check (updated_by = (select auth.uid()));

grant select on public.control_settings to anon, authenticated;
grant insert, update on public.control_settings to authenticated;

grant select, insert on public.measurements to authenticated;

drop policy if exists "Authenticated users can read measurements" on public.measurements;
drop policy if exists "Authenticated users can insert measurements" on public.measurements;

create policy "Authenticated users can read measurements"
  on public.measurements for select to authenticated using (true);

create policy "Authenticated users can insert measurements"
  on public.measurements for insert to authenticated with check (true);

do $$
begin
  alter publication supabase_realtime add table public.measurements;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.control_settings;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
