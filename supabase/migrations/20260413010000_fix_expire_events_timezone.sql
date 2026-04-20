-- Corrige expire_events() para usar timezone Chile (America/Santiago)
-- y expirar solo cuando se cumplan AMBAS condiciones: fecha Y hora de fin.
-- Chile usa America/Santiago (UTC-4 normalmente, UTC-3 en horario de verano).

create or replace function expire_events()
returns void
language plpgsql
security definer
as $$
declare
  now_santiago timestamp := (now() at time zone 'America/Santiago');
begin
  update events
  set
    status    = 'ended',
    is_active = false
  where status not in ('ended', 'draft')
    and (
      -- Tiene fecha Y hora de fin → expirar solo cuando AMBAS hayan pasado en Chile
      (
        end_date is not null
        and end_time is not null
        and (end_date::text || ' ' || end_time::text)::timestamp < now_santiago
      )
      or
      -- Tiene fecha de fin pero sin hora → expirar al comienzo del día siguiente
      (
        end_date is not null
        and end_time is null
        and end_date::date < now_santiago::date
      )
      or
      -- Sin fecha de fin → usar fecha de inicio, expirar al comienzo del día siguiente
      (
        end_date is null
        and date is not null
        and date::date < now_santiago::date
      )
    );
end;
$$;

-- Si ya tienes el cron job creado, no necesitas recrearlo.
-- Si aún no lo tienes, ejecuta esto en Supabase SQL Editor:
-- select cron.schedule('expire-events', '*/15 * * * *', 'select expire_events()');
-- (corre cada 15 minutos para mayor precisión)
