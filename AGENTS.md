# Repository Guide

## Project

- React 18, TypeScript, and Vite application for an industrial heating control dashboard.
- The interface and user-facing copy are primarily in French; preserve that convention.
- `src/App.tsx` owns the dashboard pages and UI state. `src/data.ts` maps database rows to display models. Supabase access is grouped under `src/lib/` and `src/services/`.
- `supabase/schema.sql` is the database schema and policy reference. Read `docs/supabase-test.md` before changing measurement or control-setting behavior.

## Commands

- `npm run dev` starts the Vite development server.
- `npm run lint` runs the TypeScript check (`tsc --noEmit`).
- `npm run build` runs TypeScript validation and creates a production build.
- Run `npm run lint` after TypeScript changes and `npm run build` for changes that could affect bundling or production behavior.

## Supabase and Secrets

- Browser configuration is read from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`; `.env.example` documents the expected public configuration.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or any other secret through a `VITE_` variable, frontend code, logs, or committed files. Vite variables prefixed with `VITE_` are available to browser code.
- Keep `.env.local` untracked. Use Supabase Auth and database row-level security for privileged operations; do not treat the anonymous key as an authorization boundary.
- Measurements are telemetry. Store writable control targets in `control_settings`; do not present saving a target as directly commanding the heater or PLC.
- Do not infer physical units for `heating_power` or `pid_output` unless the schema or project documentation confirms them.

## Change Practices

- Keep changes focused and follow the existing TypeScript and CSS conventions.
- Preserve database row-level security and validate measurement/control inputs at the appropriate boundary.
- Update `docs/supabase-test.md` when setup or database behavior changes.