-- (Opcional) eventos demo
create table if not exists events (
  id serial primary key,
  name text not null
);

insert into events(name) values ('Sorteo Principal')
on conflict do nothing;

-- Tickets con ID "bigserial" (recomendado para tu server.js)
drop table if exists tickets cascade;

create table tickets (
  id bigserial primary key,
  event_id int not null references events(id) on delete cascade,
  number int not null,
  status text not null default 'available', -- available | reserved | sold
  reserved_until timestamptz null,
  unique(event_id, number)
);

-- Semilla 1..10000 para event_id=1
insert into tickets(event_id, number, status, reserved_until)
select 1, n, 'available', null
from generate_series(1,10000) as g(n)
on conflict do nothing;

-- Índices útiles
create index if not exists idx_tickets_event_status on tickets(event_id, status);
create index if not exists idx_tickets_reserved_until on tickets(reserved_until);

-- ===== Usuarios (para login admin) =====
create table if not exists users (
  id bigserial primary key,
  email text unique not null,
  role  text not null default 'user',
  password_hash text,
  created_at timestamptz default now()
);

-- ===== Compras =====
create table if not exists purchases (
  id bigserial primary key,
  full_name text not null,
  document text not null,
  country_code text not null,
  phone text not null,
  state text null,
  account_holder text null,
  payment_ref_last4 text null,
  qty int not null,
  price numeric(10,2) not null,
  method text null,
  receipt_url text null,
  status text not null default 'received',   -- received | assigned | approved | rejected
  email text null,
  masked_numbers text[] null,                -- lo usa /verify y admin/confirm
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- trigger simple para updated_at (opcional)
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then
    create or replace function set_updated_at() returns trigger as $t$
    begin
      new.updated_at = now();
      return new;
    end; $t$ language plpgsql;
  end if;
exception when others then null;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'purchases_set_updated_at'
  ) then
    create trigger purchases_set_updated_at
    before update on purchases
    for each row execute procedure set_updated_at();
  end if;
exception when others then null;
end$$;

-- ===== Auditoría de acciones admin =====
create table if not exists audit_log (
  id bigserial primary key,
  purchase_id bigint not null references purchases(id) on delete cascade,
  admin_id bigint null references users(id) on delete set null,
  action text not null,            -- approved | rejected | etc.
  notes text null,
  created_at timestamptz default now()
);

-- (Opcional) ampliar events con total_tickets
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name='events' and column_name='total_tickets') then
    alter table events add column total_tickets integer not null default 10000;
    update events set total_tickets = 10000 where total_tickets is null;
  end if;
end$$;

-- Relación compra <-> tickets (útil para verify y auditoría)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name='tickets' and column_name='purchase_id') then
    alter table tickets add column purchase_id bigint null references purchases(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='tickets' and column_name='assigned_at') then
    alter table tickets add column assigned_at timestamptz null;
  end if;
end$$;

-- Índices extra (si no estaban)
create index if not exists idx_tickets_purchase on tickets(purchase_id);
create index if not exists idx_purchases_phone on purchases(phone);
