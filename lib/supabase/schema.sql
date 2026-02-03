-- Olera Database Schema
-- Run this in the Supabase SQL editor to set up all tables and RLS policies.

-- ============================================================
-- ENUMS
-- ============================================================

create type profile_type as enum ('organization', 'caregiver', 'family');

create type profile_category as enum (
  -- Home-based organizations
  'home_care_agency',
  'home_health_agency',
  'hospice_agency',
  -- Facility-based organizations
  'independent_living',
  'assisted_living',
  'memory_care',
  'nursing_home',
  'inpatient_hospice',
  'rehab_facility',
  'adult_day_care',
  'wellness_center',
  -- Caregivers
  'private_caregiver'
);

create type claim_state as enum ('unclaimed', 'pending', 'claimed');
create type verification_state as enum ('unverified', 'pending', 'verified');
create type profile_source as enum ('seeded', 'user_created');

create type membership_plan as enum ('free', 'pro');
create type membership_status as enum ('trialing', 'active', 'past_due', 'canceled', 'free');
create type billing_cycle as enum ('monthly', 'annual');

create type connection_type as enum ('inquiry', 'save', 'application', 'invitation');
create type connection_status as enum ('pending', 'accepted', 'declined', 'archived');

-- ============================================================
-- ACCOUNTS
-- One account per authenticated user. The "person" behind profiles.
-- ============================================================

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  active_profile_id uuid, -- FK added after profiles table exists
  display_name text,
  avatar_url text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create account on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.accounts (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- PROFILES
-- The universal entity. Organizations, caregivers, and families.
-- ============================================================

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete set null,
  slug text not null unique,
  type profile_type not null,
  category profile_category,
  display_name text not null,
  description text,
  image_url text,
  phone text,
  email text,
  website text,
  address text,
  city text,
  state text,
  zip text,
  lat double precision,
  lng double precision,
  service_area text, -- e.g., "Greater Austin Area"
  care_types text[] not null default '{}',
  metadata jsonb not null default '{}', -- type-specific fields
  claim_state claim_state not null default 'unclaimed',
  verification_state verification_state not null default 'unverified',
  source profile_source not null default 'user_created',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add FK from accounts to profiles now that profiles table exists
alter table public.accounts
  add constraint accounts_active_profile_fk
  foreign key (active_profile_id) references public.profiles(id) on delete set null;

-- Indexes for common queries
create index profiles_type_idx on public.profiles(type);
create index profiles_category_idx on public.profiles(category);
create index profiles_claim_state_idx on public.profiles(claim_state);
create index profiles_account_id_idx on public.profiles(account_id);
create index profiles_city_state_idx on public.profiles(city, state);
create index profiles_care_types_idx on public.profiles using gin(care_types);
create index profiles_metadata_idx on public.profiles using gin(metadata);

-- ============================================================
-- MEMBERSHIPS
-- One per account. Controls paywall access.
-- ============================================================

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.accounts(id) on delete cascade,
  plan membership_plan not null default 'free',
  billing_cycle billing_cycle,
  status membership_status not null default 'free',
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  free_responses_used integer not null default 0,
  free_responses_reset_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- CONNECTIONS
-- Relationships between profiles. Inquiries, saves, applications.
-- ============================================================

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  from_profile_id uuid not null references public.profiles(id) on delete cascade,
  to_profile_id uuid not null references public.profiles(id) on delete cascade,
  type connection_type not null,
  status connection_status not null default 'pending',
  message text, -- v1: initial inquiry message. v2: migrated to messages table.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Prevent duplicate connections of the same type
  unique(from_profile_id, to_profile_id, type)
);

create index connections_to_profile_idx on public.connections(to_profile_id);
create index connections_from_profile_idx on public.connections(from_profile_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.update_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.update_updated_at();
create trigger memberships_updated_at before update on public.memberships
  for each row execute function public.update_updated_at();
create trigger connections_updated_at before update on public.connections
  for each row execute function public.update_updated_at();

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================

alter table public.accounts enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.connections enable row level security;

-- ACCOUNTS: users can only read/update their own account
create policy "Users can read own account"
  on public.accounts for select
  using (auth.uid() = user_id);

create policy "Users can update own account"
  on public.accounts for update
  using (auth.uid() = user_id);

-- Helper: get active profile type without triggering RLS recursion on profiles
create or replace function public.active_profile_type()
returns profile_type as $$
  select p.type from public.profiles p
  join public.accounts a on a.active_profile_id = p.id
  where a.user_id = auth.uid()
  limit 1;
$$ language sql security definer stable;

-- PROFILES: public read for non-family profiles, restricted for family profiles
create policy "Anyone can read non-family profiles"
  on public.profiles for select
  using (type != 'family');

create policy "Authenticated providers can read family profiles"
  on public.profiles for select
  using (
    type = 'family'
    and auth.uid() is not null
    and public.active_profile_type() in ('organization', 'caregiver')
  );

create policy "Users can read own family profiles"
  on public.profiles for select
  using (
    type = 'family'
    and exists (
      select 1 from public.accounts
      where accounts.user_id = auth.uid()
      and accounts.id = profiles.account_id
    )
  );

create policy "Users can insert profiles for own account"
  on public.profiles for insert
  with check (
    exists (
      select 1 from public.accounts
      where accounts.user_id = auth.uid()
      and accounts.id = account_id
    )
  );

create policy "Users can update own profiles"
  on public.profiles for update
  using (
    exists (
      select 1 from public.accounts
      where accounts.user_id = auth.uid()
      and accounts.id = profiles.account_id
    )
  );

-- PROFILES: users can claim unclaimed profiles (update where account_id is null)
create policy "Users can claim unclaimed profiles"
  on public.profiles for update
  using (
    claim_state = 'unclaimed'
    and account_id is null
    and auth.uid() is not null
  );

-- MEMBERSHIPS: users can only read their own
create policy "Users can read own membership"
  on public.memberships for select
  using (
    exists (
      select 1 from public.accounts
      where accounts.user_id = auth.uid()
      and accounts.id = memberships.account_id
    )
  );

create policy "Users can insert own membership"
  on public.memberships for insert
  with check (
    exists (
      select 1 from public.accounts
      where accounts.user_id = auth.uid()
      and accounts.id = account_id
    )
  );

create policy "Users can update own membership"
  on public.memberships for update
  using (
    exists (
      select 1 from public.accounts
      where accounts.user_id = auth.uid()
      and accounts.id = memberships.account_id
    )
  );

-- CONNECTIONS: participants can read their own connections
create policy "Users can read own connections"
  on public.connections for select
  using (
    exists (
      select 1 from public.accounts a
      join public.profiles p on p.account_id = a.id
      where a.user_id = auth.uid()
      and (p.id = connections.from_profile_id or p.id = connections.to_profile_id)
    )
  );

create policy "Users can insert connections from own profiles"
  on public.connections for insert
  with check (
    exists (
      select 1 from public.accounts a
      join public.profiles p on p.account_id = a.id
      where a.user_id = auth.uid()
      and p.id = from_profile_id
    )
  );

create policy "Users can update connections they participate in"
  on public.connections for update
  using (
    exists (
      select 1 from public.accounts a
      join public.profiles p on p.account_id = a.id
      where a.user_id = auth.uid()
      and (p.id = connections.from_profile_id or p.id = connections.to_profile_id)
    )
  );
