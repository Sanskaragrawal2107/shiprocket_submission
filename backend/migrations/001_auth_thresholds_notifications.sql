-- D2C AI Employee schema migration
-- Adds merchant auth fields, merchant thresholds, notifications, and RLS policies.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Merchants
-- -----------------------------------------------------------------------------

create table if not exists public.merchants (
  merchant_id text primary key,
  name text not null,
  email text,
  password_hash text,
  shopify_store_url text,
  shopify_access_token text,
  razorpay_key_id text,
  razorpay_key_secret text,
  shiprocket_email text,
  shiprocket_password text,
  meta_ads_account_id text,
  meta_ads_access_token text,
  is_active boolean default true,
  last_synced_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table if exists public.merchants
  add column if not exists email text,
  add column if not exists password_hash text,
  add column if not exists shopify_store_url text,
  add column if not exists shopify_access_token text,
  add column if not exists razorpay_key_id text,
  add column if not exists razorpay_key_secret text,
  add column if not exists shiprocket_email text,
  add column if not exists shiprocket_password text,
  add column if not exists meta_ads_account_id text,
  add column if not exists meta_ads_access_token text,
  add column if not exists is_active boolean default true,
  add column if not exists last_synced_at timestamptz;

update public.merchants
set email = coalesce(email, merchant_id || '@placeholder.local')
where email is null;

update public.merchants
set password_hash = coalesce(password_hash, '$2b$12$C6UzMDM.H6dfI/f/IKcEeO6OZ6A9aOt7q5R3Yf4rJ5lFJkW8m8Q5m')
where password_hash is null;

alter table public.merchants
  alter column email set not null,
  alter column password_hash set not null;

create unique index if not exists merchants_email_unique_idx on public.merchants (email);

-- -----------------------------------------------------------------------------
-- Merchant thresholds
-- -----------------------------------------------------------------------------

create table if not exists public.merchant_thresholds (
  id uuid primary key default gen_random_uuid(),
  merchant_id text references public.merchants (merchant_id) on delete cascade,
  metric text not null,
  threshold_value numeric not null,
  operator text not null check (operator in ('greater_than', 'less_than')),
  created_at timestamptz default now(),
  unique (merchant_id, metric)
);

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  merchant_id text references public.merchants (merchant_id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- Meta Ads
-- -----------------------------------------------------------------------------

create table if not exists public.meta_ads (
  id uuid primary key default gen_random_uuid(),
  merchant_id text references public.merchants (merchant_id) on delete cascade,
  campaign_id text not null,
  campaign_name text not null,
  spend numeric default 0,
  impressions bigint default 0,
  clicks bigint default 0,
  conversions bigint default 0,
  date date not null,
  source text,
  source_row_ref text not null unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- JWT helper for RLS policies
-- -----------------------------------------------------------------------------

create or replace function public.jwt_merchant_id()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'merchant_id', '');
$$;

-- -----------------------------------------------------------------------------
-- RLS policies for merchant-owned tables
-- -----------------------------------------------------------------------------

alter table public.merchants enable row level security;
alter table public.merchant_thresholds enable row level security;
alter table public.notifications enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.deliveries enable row level security;
alter table public.meta_ads enable row level security;
alter table public.agent_insights enable row level security;

-- Merchants
drop policy if exists merchants_select_own on public.merchants;
drop policy if exists merchants_insert_own on public.merchants;
drop policy if exists merchants_update_own on public.merchants;
drop policy if exists merchants_delete_own on public.merchants;

create policy merchants_select_own on public.merchants
  for select using (public.jwt_merchant_id() = merchant_id);

create policy merchants_insert_own on public.merchants
  for insert with check (public.jwt_merchant_id() = merchant_id);

create policy merchants_update_own on public.merchants
  for update using (public.jwt_merchant_id() = merchant_id)
  with check (public.jwt_merchant_id() = merchant_id);

create policy merchants_delete_own on public.merchants
  for delete using (public.jwt_merchant_id() = merchant_id);

-- Merchant thresholds
drop policy if exists merchant_thresholds_select_own on public.merchant_thresholds;
drop policy if exists merchant_thresholds_insert_own on public.merchant_thresholds;
drop policy if exists merchant_thresholds_update_own on public.merchant_thresholds;
drop policy if exists merchant_thresholds_delete_own on public.merchant_thresholds;

create policy merchant_thresholds_select_own on public.merchant_thresholds
  for select using (public.jwt_merchant_id() = merchant_id);

create policy merchant_thresholds_insert_own on public.merchant_thresholds
  for insert with check (public.jwt_merchant_id() = merchant_id);

create policy merchant_thresholds_update_own on public.merchant_thresholds
  for update using (public.jwt_merchant_id() = merchant_id)
  with check (public.jwt_merchant_id() = merchant_id);

create policy merchant_thresholds_delete_own on public.merchant_thresholds
  for delete using (public.jwt_merchant_id() = merchant_id);

-- Notifications
drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_insert_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists notifications_delete_own on public.notifications;

create policy notifications_select_own on public.notifications
  for select using (public.jwt_merchant_id() = merchant_id);

create policy notifications_insert_own on public.notifications
  for insert with check (public.jwt_merchant_id() = merchant_id);

create policy notifications_update_own on public.notifications
  for update using (public.jwt_merchant_id() = merchant_id)
  with check (public.jwt_merchant_id() = merchant_id);

create policy notifications_delete_own on public.notifications
  for delete using (public.jwt_merchant_id() = merchant_id);

-- Data tables
drop policy if exists orders_select_own on public.orders;
drop policy if exists orders_insert_own on public.orders;
drop policy if exists orders_update_own on public.orders;
drop policy if exists orders_delete_own on public.orders;

create policy orders_select_own on public.orders
  for select using (public.jwt_merchant_id() = merchant_id);

create policy orders_insert_own on public.orders
  for insert with check (public.jwt_merchant_id() = merchant_id);

create policy orders_update_own on public.orders
  for update using (public.jwt_merchant_id() = merchant_id)
  with check (public.jwt_merchant_id() = merchant_id);

create policy orders_delete_own on public.orders
  for delete using (public.jwt_merchant_id() = merchant_id);

drop policy if exists payments_select_own on public.payments;
drop policy if exists payments_insert_own on public.payments;
drop policy if exists payments_update_own on public.payments;
drop policy if exists payments_delete_own on public.payments;

create policy payments_select_own on public.payments
  for select using (public.jwt_merchant_id() = merchant_id);

create policy payments_insert_own on public.payments
  for insert with check (public.jwt_merchant_id() = merchant_id);

create policy payments_update_own on public.payments
  for update using (public.jwt_merchant_id() = merchant_id)
  with check (public.jwt_merchant_id() = merchant_id);

create policy payments_delete_own on public.payments
  for delete using (public.jwt_merchant_id() = merchant_id);

drop policy if exists deliveries_select_own on public.deliveries;
drop policy if exists deliveries_insert_own on public.deliveries;
drop policy if exists deliveries_update_own on public.deliveries;
drop policy if exists deliveries_delete_own on public.deliveries;

create policy deliveries_select_own on public.deliveries
  for select using (public.jwt_merchant_id() = merchant_id);

create policy deliveries_insert_own on public.deliveries
  for insert with check (public.jwt_merchant_id() = merchant_id);

create policy deliveries_update_own on public.deliveries
  for update using (public.jwt_merchant_id() = merchant_id)
  with check (public.jwt_merchant_id() = merchant_id);

create policy deliveries_delete_own on public.deliveries
  for delete using (public.jwt_merchant_id() = merchant_id);

drop policy if exists meta_ads_select_own on public.meta_ads;
drop policy if exists meta_ads_insert_own on public.meta_ads;
drop policy if exists meta_ads_update_own on public.meta_ads;
drop policy if exists meta_ads_delete_own on public.meta_ads;

create policy meta_ads_select_own on public.meta_ads
  for select using (public.jwt_merchant_id() = merchant_id);

create policy meta_ads_insert_own on public.meta_ads
  for insert with check (public.jwt_merchant_id() = merchant_id);

create policy meta_ads_update_own on public.meta_ads
  for update using (public.jwt_merchant_id() = merchant_id)
  with check (public.jwt_merchant_id() = merchant_id);

create policy meta_ads_delete_own on public.meta_ads
  for delete using (public.jwt_merchant_id() = merchant_id);

drop policy if exists agent_insights_select_own on public.agent_insights;
drop policy if exists agent_insights_insert_own on public.agent_insights;
drop policy if exists agent_insights_update_own on public.agent_insights;
drop policy if exists agent_insights_delete_own on public.agent_insights;

create policy agent_insights_select_own on public.agent_insights
  for select using (public.jwt_merchant_id() = merchant_id);

create policy agent_insights_insert_own on public.agent_insights
  for insert with check (public.jwt_merchant_id() = merchant_id);

create policy agent_insights_update_own on public.agent_insights
  for update using (public.jwt_merchant_id() = merchant_id)
  with check (public.jwt_merchant_id() = merchant_id);

create policy agent_insights_delete_own on public.agent_insights
  for delete using (public.jwt_merchant_id() = merchant_id);
