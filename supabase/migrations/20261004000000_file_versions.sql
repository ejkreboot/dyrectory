-- File version history. A file's content can change (e.g. a PDF form filled in the browser) but
-- earlier versions are kept. Content changes only go through the functions below, so every
-- change is recorded; members can still rename and move files directly.
--
-- Apply with:  supabase db query --linked -f supabase/migrations/20261004000000_file_versions.sql

begin;

create table estate.file_versions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references estate.files (id) on delete cascade,
  storage_path text not null,
  size_bytes bigint not null,
  mime_type text,
  kind text not null check (kind in ('uploaded', 'filled', 'replaced', 'restored')),
  created_by uuid default auth.uid() references estate.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index file_versions_file_id_created_at_idx on estate.file_versions (file_id, created_at desc);
create index file_versions_created_by_idx on estate.file_versions (created_by);

alter table estate.file_versions enable row level security;

create policy "estate: members read file versions"
  on estate.file_versions for select
  to authenticated
  using ((select estate.is_member()));

-- Existing files start with their upload as version 1.
insert into estate.file_versions (file_id, storage_path, size_bytes, mime_type, kind, created_by, created_at)
select id, storage_path, size_bytes, mime_type, 'uploaded', uploaded_by, created_at
from estate.files;

create function estate.files_record_upload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into estate.file_versions (file_id, storage_path, size_bytes, mime_type, kind, created_by, created_at)
  values (new.id, new.storage_path, new.size_bytes, new.mime_type, 'uploaded', new.uploaded_by, new.created_at);
  return new;
end;
$$;

create trigger files_record_upload
  after insert on estate.files
  for each row execute function estate.files_record_upload();

-- Point a file at newly uploaded content (already in storage) and record it as a new version.
create function estate.replace_file_content(target uuid, new_path text, new_size bigint, new_mime text, change_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not estate.is_member() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if change_kind not in ('filled', 'replaced') then
    raise exception 'Invalid change kind.';
  end if;

  update estate.files
  set storage_path = new_path, size_bytes = new_size, mime_type = new_mime
  where id = target;
  if not found then
    raise exception 'File not found.';
  end if;

  insert into estate.file_versions (file_id, storage_path, size_bytes, mime_type, kind)
  values (target, new_path, new_size, new_mime, change_kind);
end;
$$;

-- Make an earlier version current again. Nothing is lost: the restore is itself a new version.
create function estate.restore_file_version(version uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v estate.file_versions;
begin
  if not estate.is_member() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  select * into v from estate.file_versions where id = version;
  if not found then
    raise exception 'Version not found.';
  end if;

  update estate.files
  set storage_path = v.storage_path, size_bytes = v.size_bytes, mime_type = v.mime_type
  where id = v.file_id;

  insert into estate.file_versions (file_id, storage_path, size_bytes, mime_type, kind)
  values (v.file_id, v.storage_path, v.size_bytes, v.mime_type, 'restored');
end;
$$;

-- Storage keys of every version of every file inside a folder (recursively), for deletion.
create or replace function estate.folder_storage_paths(target uuid)
returns setof text
language sql
stable
set search_path = ''
as $$
  with recursive tree as (
    select f.id from estate.folders f where f.id = target
    union all
    select f.id from estate.folders f join tree t on f.parent_id = t.id
  ),
  tree_files as (
    select fi.id, fi.storage_path from estate.files fi where fi.folder_id in (select id from tree)
  )
  select storage_path from tree_files
  union
  select v.storage_path from estate.file_versions v where v.file_id in (select id from tree_files);
$$;

-- Content columns can only change through the functions above.
revoke update on estate.files from authenticated;
grant update (name, folder_id) on estate.files to authenticated;

grant select on estate.file_versions to authenticated;
grant all on estate.file_versions to service_role;

revoke all on function
  estate.files_record_upload(),
  estate.replace_file_content(uuid, text, bigint, text, text),
  estate.restore_file_version(uuid)
from public;
grant execute on function
  estate.replace_file_content(uuid, text, bigint, text, text),
  estate.restore_file_version(uuid)
to authenticated;
grant execute on all functions in schema estate to service_role;

commit;
