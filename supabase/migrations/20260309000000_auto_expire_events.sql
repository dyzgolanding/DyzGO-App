-- Función que marca como 'ended' todos los eventos cuya fecha/hora de fin ya pasó.
-- Llamar desde: Supabase Dashboard → Database → Functions → cron job cada hora.
-- O ejecutar manualmente con: SELECT expire_events();
create or replace function expire_events()
returns void
language plpgsql
security definer
as $$
begin
  update events
  set status = 'ended'
  where status not in ('ended', 'draft', 'cancelled')
    and (
      (end_date is not null and end_time is not null and (end_date || 'T' || end_time)::timestamptz < now())
      or (end_date is not null and end_time is null and end_date::date < current_date)
      or (end_date is null and date is not null and date::date < current_date)
    );
end;
$$;

-- Cron job (requiere pg_cron habilitado en el proyecto Supabase):
-- select cron.schedule('expire-events', '0 * * * *', 'select expire_events()');
