-- Estate organizer: members, shared document vault (folders + files), and to-do list.
--
-- Everything lives in its own `estate` schema because the Supabase project is shared with other
-- apps. Auth users are shared too, so access is opt-in: a person can use this app only if they
-- have an *active* row in estate.profiles, which only an admin (via the estate-admin edge
-- function) can create. Nothing here touches auth.users or other apps' objects.
--
-- Apply with:  supabase db query --linked -f supabase/migrations/20261003000000_estate_schema.sql
-- (not `db push`: the shared project's migration history belongs to the other apps).

begin;

create schema estate;

grant usage on schema estate to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Profiles (membership)
-- ---------------------------------------------------------------------------------------------

create type estate.user_role as enum ('admin', 'member');

create table estate.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role estate.user_role not null default 'member',
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

alter table estate.profiles enable row level security;

create function estate.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from estate.profiles where id = auth.uid() and is_active
  );
$$;

create function estate.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from estate.profiles where id = auth.uid() and is_active and role = 'admin'
  );
$$;

-- Called by the client after the user has chosen their own password.
create function estate.clear_must_change_password()
returns void
language sql
security definer
set search_path = ''
as $$
  update estate.profiles set must_change_password = false where id = auth.uid();
$$;

-- Members can see each other (for names on files and tasks); everyone can see their own row.
-- Writes go through the estate-admin edge function, which uses the service role.
create policy "estate: profiles visible to members"
  on estate.profiles for select
  to authenticated
  using (id = (select auth.uid()) or (select estate.is_member()));

-- ---------------------------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------------------------

create function estate.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Folders and files
-- ---------------------------------------------------------------------------------------------

create table estate.folders (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references estate.folders (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 255),
  created_by uuid default auth.uid() references estate.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Folder names are unique (case-insensitively) within their parent; null parent = top level.
create unique index folders_parent_name_key
  on estate.folders (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create index folders_parent_id_idx on estate.folders (parent_id);
create index folders_created_by_idx on estate.folders (created_by);

create trigger folders_set_updated_at
  before update on estate.folders
  for each row execute function estate.set_updated_at();

create function estate.folders_prevent_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null and exists (
    with recursive ancestors as (
      select f.id, f.parent_id from estate.folders f where f.id = new.parent_id
      union all
      select f.id, f.parent_id from estate.folders f join ancestors a on f.id = a.parent_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'A folder cannot be moved inside itself.';
  end if;
  return new;
end;
$$;

create trigger folders_prevent_cycle
  before update of parent_id on estate.folders
  for each row execute function estate.folders_prevent_cycle();

create table estate.files (
  id uuid primary key default gen_random_uuid(),
  -- null folder = top level of the vault
  folder_id uuid references estate.folders (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 255),
  -- Object key in the "estate-files" bucket. Independent of name/folder so renames and moves
  -- never touch storage.
  storage_path text not null unique,
  size_bytes bigint not null default 0,
  mime_type text,
  uploaded_by uuid default auth.uid() references estate.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index files_folder_id_idx on estate.files (folder_id);
create index files_uploaded_by_idx on estate.files (uploaded_by);

create trigger files_set_updated_at
  before update on estate.files
  for each row execute function estate.set_updated_at();

-- Storage keys of every file inside a folder (recursively), so the client can remove the
-- objects from storage when the folder is deleted.
create function estate.folder_storage_paths(target uuid)
returns setof text
language sql
stable
set search_path = ''
as $$
  with recursive tree as (
    select f.id from estate.folders f where f.id = target
    union all
    select f.id from estate.folders f join tree t on f.parent_id = t.id
  )
  select fi.storage_path from estate.files fi where fi.folder_id in (select id from tree);
$$;

alter table estate.folders enable row level security;
alter table estate.files enable row level security;

create policy "estate: members manage folders"
  on estate.folders for all
  to authenticated
  using ((select estate.is_member()))
  with check ((select estate.is_member()));

create policy "estate: members manage files"
  on estate.files for all
  to authenticated
  using ((select estate.is_member()))
  with check ((select estate.is_member()));

-- ---------------------------------------------------------------------------------------------
-- To-do list
-- ---------------------------------------------------------------------------------------------

create table estate.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 500),
  notes text not null default '',
  due_date date,
  assigned_to uuid references estate.profiles (id) on delete set null,
  is_done boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references estate.profiles (id) on delete set null,
  created_by uuid default auth.uid() references estate.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_assigned_to_idx on estate.tasks (assigned_to);
create index tasks_completed_by_idx on estate.tasks (completed_by);
create index tasks_created_by_idx on estate.tasks (created_by);

create trigger tasks_set_updated_at
  before update on estate.tasks
  for each row execute function estate.set_updated_at();

-- Files a task refers to. Deleting a file just removes the reference.
create table estate.task_files (
  task_id uuid not null references estate.tasks (id) on delete cascade,
  file_id uuid not null references estate.files (id) on delete cascade,
  primary key (task_id, file_id)
);

create index task_files_file_id_idx on estate.task_files (file_id);

alter table estate.tasks enable row level security;
alter table estate.task_files enable row level security;

create policy "estate: members manage tasks"
  on estate.tasks for all
  to authenticated
  using ((select estate.is_member()))
  with check ((select estate.is_member()));

create policy "estate: members manage task files"
  on estate.task_files for all
  to authenticated
  using ((select estate.is_member()))
  with check ((select estate.is_member()));

-- ---------------------------------------------------------------------------------------------
-- Privileges. RLS decides which rows; these decide which operations. No access for anon.
-- ---------------------------------------------------------------------------------------------

grant select on estate.profiles to authenticated;
grant select, insert, update, delete on estate.folders, estate.files, estate.tasks, estate.task_files to authenticated;
grant all on all tables in schema estate to service_role;

revoke all on all functions in schema estate from public;
grant execute on function
  estate.is_member(),
  estate.is_admin(),
  estate.clear_must_change_password(),
  estate.folder_storage_paths(uuid)
to authenticated;
grant execute on all functions in schema estate to service_role;

-- ---------------------------------------------------------------------------------------------
-- Storage: one private bucket, readable and writable by active members only
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('estate-files', 'estate-files', false, 52428800);

create policy "estate: members read files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'estate-files' and (select estate.is_member()));

create policy "estate: members upload files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'estate-files' and (select estate.is_member()));

create policy "estate: members update files"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'estate-files' and (select estate.is_member()))
  with check (bucket_id = 'estate-files' and (select estate.is_member()));

create policy "estate: members delete files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'estate-files' and (select estate.is_member()));

commit;
