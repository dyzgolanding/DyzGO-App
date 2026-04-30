-- ─────────────────────────────────────────────────────────────────────────────
-- Sistema de Reservas de Mesas — Standalone (sin dependencia de clubs)
-- ─────────────────────────────────────────────────────────────────────────────

-- Venues independientes (Bar, Restaurante, etc.)
create table if not exists public.bar_venues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  city        text,
  image_url   text,
  description text,
  instagram   text,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- Zonas del local
create table if not exists public.venue_zones (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.bar_venues(id) on delete cascade,
  name        text not null,
  description text,
  image_url   text,
  is_vip      boolean default false,
  sort_order  int default 0,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- Mesas individuales por zona
create table if not exists public.venue_tables (
  id           uuid primary key default gen_random_uuid(),
  zone_id      uuid not null references public.venue_zones(id) on delete cascade,
  venue_id     uuid not null references public.bar_venues(id) on delete cascade,
  table_number text not null,
  capacity_min int default 2,
  capacity_max int default 6,
  is_available boolean default true,
  x_pos        numeric default 0,
  y_pos        numeric default 0,
  created_at   timestamptz default now()
);

-- Horarios disponibles por día de semana (0=Dom … 6=Sáb)
create table if not exists public.table_time_slots (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.bar_venues(id) on delete cascade,
  day_of_week int check (day_of_week between 0 and 6),
  time        text not null,
  label       text not null,
  is_active   boolean default true,
  sort_order  int default 0,
  created_at  timestamptz default now()
);

-- Reservas
create table if not exists public.table_reservations (
  id                uuid primary key default gen_random_uuid(),
  table_id          uuid references public.venue_tables(id) on delete set null,
  zone_id           uuid references public.venue_zones(id) on delete set null,
  venue_id          uuid not null references public.bar_venues(id) on delete cascade,
  user_id           uuid references auth.users(id) on delete set null,
  date              date not null,
  time_slot         text not null,
  party_size        int not null,
  guest_name        text not null,
  guest_phone       text not null,
  status            text default 'pending' check (status in ('pending','confirmed','cancelled','seated','completed','no_show')),
  notes             text,
  min_consumption   int default 0,
  confirmation_code text unique default upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- Trigger updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_reservations_updated_at
  before update on public.table_reservations
  for each row execute function public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.bar_venues         enable row level security;
alter table public.venue_zones        enable row level security;
alter table public.venue_tables       enable row level security;
alter table public.table_time_slots   enable row level security;
alter table public.table_reservations enable row level security;

-- Lectura pública (venues, zonas, mesas, horarios)
create policy "public_read_venues"     on public.bar_venues         for select using (true);
create policy "public_read_zones"      on public.venue_zones        for select using (true);
create policy "public_read_tables"     on public.venue_tables       for select using (true);
create policy "public_read_time_slots" on public.table_time_slots   for select using (true);

-- Reservas: el usuario ve solo las suyas
create policy "user_read_own_reservations" on public.table_reservations
  for select using (auth.uid() = user_id);

-- Cualquier usuario autenticado puede crear
create policy "user_insert_reservation" on public.table_reservations
  for insert with check (auth.uid() = user_id);

-- El usuario puede cancelar la suya (solo si está pendiente)
create policy "user_cancel_reservation" on public.table_reservations
  for update using (auth.uid() = user_id and status = 'pending')
  with check (status = 'cancelled');

-- Admins (god) tienen acceso total a reservas
create policy "god_all_reservations" on public.table_reservations
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'god')
  );

-- ─── SEED: Club Gordos ───────────────────────────────────────────────────────
do $$
declare
  v_id      uuid;
  z_terraza uuid;
  z_bar     uuid;
  z_vip     uuid;
  z_salon   uuid;
begin
  -- Crear venue si no existe
  insert into public.bar_venues (name, address, city, description)
  values ('Club Gordos', 'Vitacura', 'Santiago', 'Bar exclusivo en Vitacura')
  on conflict do nothing;

  select id into v_id from public.bar_venues where name = 'Club Gordos' limit 1;
  if v_id is null then return; end if;

  -- Zonas
  insert into public.venue_zones (venue_id, name, description, is_vip, sort_order)
  values
    (v_id, 'Terraza',        'Zona al aire libre con vista a la ciudad', false, 1),
    (v_id, 'Bar Principal',  'Cerca de la barra, ambiente más dinámico', false, 2),
    (v_id, 'VIP',            'Zona exclusiva con servicio personalizado', true,  3),
    (v_id, 'Salón Interior', 'Interior climatizado, más íntimo',         false, 4)
  on conflict do nothing;

  select id into z_terraza from public.venue_zones where venue_id = v_id and name = 'Terraza'        limit 1;
  select id into z_bar     from public.venue_zones where venue_id = v_id and name = 'Bar Principal'  limit 1;
  select id into z_vip     from public.venue_zones where venue_id = v_id and name = 'VIP'            limit 1;
  select id into z_salon   from public.venue_zones where venue_id = v_id and name = 'Salón Interior' limit 1;

  -- Mesas Terraza
  insert into public.venue_tables (zone_id, venue_id, table_number, capacity_min, capacity_max, x_pos, y_pos)
  values
    (z_terraza, v_id, 'T1', 2, 4, 10, 15),
    (z_terraza, v_id, 'T2', 2, 4, 35, 15),
    (z_terraza, v_id, 'T3', 2, 6, 60, 15),
    (z_terraza, v_id, 'T4', 4, 8, 10, 50),
    (z_terraza, v_id, 'T5', 4, 8, 60, 50)
  on conflict do nothing;

  -- Mesas Bar Principal
  insert into public.venue_tables (zone_id, venue_id, table_number, capacity_min, capacity_max, x_pos, y_pos)
  values
    (z_bar, v_id, 'B1', 2, 4, 15, 20),
    (z_bar, v_id, 'B2', 2, 4, 40, 20),
    (z_bar, v_id, 'B3', 2, 4, 65, 20),
    (z_bar, v_id, 'B4', 4, 6, 15, 55),
    (z_bar, v_id, 'B5', 4, 6, 65, 55)
  on conflict do nothing;

  -- Mesas VIP
  insert into public.venue_tables (zone_id, venue_id, table_number, capacity_min, capacity_max, x_pos, y_pos)
  values
    (z_vip, v_id, 'V1', 4,  8, 20, 25),
    (z_vip, v_id, 'V2', 4,  8, 50, 25),
    (z_vip, v_id, 'V3', 6, 10, 35, 60)
  on conflict do nothing;

  -- Mesas Salón Interior
  insert into public.venue_tables (zone_id, venue_id, table_number, capacity_min, capacity_max, x_pos, y_pos)
  values
    (z_salon, v_id, 'S1', 2, 4, 10, 20),
    (z_salon, v_id, 'S2', 2, 4, 35, 20),
    (z_salon, v_id, 'S3', 2, 4, 60, 20),
    (z_salon, v_id, 'S4', 4, 6, 10, 55),
    (z_salon, v_id, 'S5', 4, 6, 35, 55),
    (z_salon, v_id, 'S6', 4, 6, 60, 55)
  on conflict do nothing;

  -- Horarios (Jue–Dom)
  insert into public.table_time_slots (venue_id, day_of_week, time, label, sort_order)
  values
    -- Jueves (4)
    (v_id, 4, '20:00', '8:00 PM',  1),
    (v_id, 4, '21:00', '9:00 PM',  2),
    (v_id, 4, '22:00', '10:00 PM', 3),
    (v_id, 4, '23:00', '11:00 PM', 4),
    -- Viernes (5)
    (v_id, 5, '20:00', '8:00 PM',  1),
    (v_id, 5, '21:00', '9:00 PM',  2),
    (v_id, 5, '22:00', '10:00 PM', 3),
    (v_id, 5, '23:00', '11:00 PM', 4),
    (v_id, 5, '00:00', '12:00 AM', 5),
    -- Sábado (6)
    (v_id, 6, '20:00', '8:00 PM',  1),
    (v_id, 6, '21:00', '9:00 PM',  2),
    (v_id, 6, '22:00', '10:00 PM', 3),
    (v_id, 6, '23:00', '11:00 PM', 4),
    (v_id, 6, '00:00', '12:00 AM', 5),
    -- Domingo (0)
    (v_id, 0, '20:00', '8:00 PM',  1),
    (v_id, 0, '21:00', '9:00 PM',  2),
    (v_id, 0, '22:00', '10:00 PM', 3)
  on conflict do nothing;

end $$;
