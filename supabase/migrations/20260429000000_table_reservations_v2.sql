-- Adaptar table_reservations al nuevo flujo sin mesas pre-asignadas
alter table public.table_reservations
  alter column time_slot drop not null;

alter table public.table_reservations
  add column if not exists arrival_time time,
  add column if not exists end_time     time,
  add column if not exists guest_age    integer,
  add column if not exists reunion_type text;
