begin;

create schema campus_private;
revoke all on schema campus_private from public, anon, authenticated;
grant usage on schema campus_private to authenticated;

-- Add one row per accepted email domain. Multiple domains can share a campus key.
create table campus_private.campus_domains (
  domain text primary key check (domain = lower(domain) and domain ~ '^[a-z0-9.-]+$'),
  campus text not null check (campus ~ '^[a-z0-9-]+$')
);

create function campus_private.current_campus()
returns text
language sql stable security definer set search_path = ''
as $$
  select d.campus
  from auth.users u
  join campus_private.campus_domains d
    on d.domain = lower(split_part(u.email, '@', 2))
  where u.id = auth.uid() and u.email_confirmed_at is not null
$$;

revoke all on function campus_private.current_campus() from public, anon, authenticated;
grant execute on function campus_private.current_campus() to authenticated;

create table public.campus_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  campus text not null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  cards jsonb not null default '[]'::jsonb,
  avatar_path text,
  avatar_width integer check (avatar_width between 1 and 500),
  avatar_height integer check (avatar_height between 1 and 320),
  published_at timestamptz,
  constraint published_fish_requires_avatar check (
    published_at is null or (avatar_path is not null and avatar_width is not null and avatar_height is not null)
  )
);

create index campus_profiles_ocean_idx
  on public.campus_profiles (campus, id) where published_at is not null;

alter table public.campus_profiles enable row level security;
revoke all on public.campus_profiles from public, anon, authenticated;
grant select on public.campus_profiles to authenticated;

create policy campus_profile_reads on public.campus_profiles
  for select to authenticated
  using (
    campus = (select campus_private.current_campus())
    and (id = (select auth.uid()) or published_at is not null)
  );

create function public.campus_membership()
returns text
language sql stable security invoker set search_path = ''
as $$ select campus_private.current_campus() $$;

-- Saving a draft withdraws it from the ocean. The ordered card array is saved atomically.
create function public.save_campus_draft(p_name text, p_cards jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_campus text := campus_private.current_campus();
begin
  if v_user is null or v_campus is null then
    raise exception 'Sign in with a verified campus email.' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 40 then
    raise exception 'Use a display name between 1 and 40 characters.';
  end if;
  if jsonb_typeof(p_cards) is distinct from 'array' then
    raise exception 'Profile cards must be an array.';
  end if;
  if jsonb_array_length(p_cards) > 12 or exists (
    select 1 from jsonb_array_elements(p_cards) as item(card)
    where jsonb_typeof(card->'title') is distinct from 'string'
       or jsonb_typeof(card->'body') is distinct from 'string'
       or char_length(btrim(card->>'title')) not between 1 and 50
       or char_length(btrim(card->>'body')) not between 1 and 500
       or (card - 'title' - 'body') <> '{}'::jsonb
  ) then
    raise exception 'Use up to 12 cards with a title and text in each.';
  end if;

  insert into public.campus_profiles (id, campus, display_name, cards)
  values (v_user, v_campus, btrim(p_name), p_cards)
  on conflict (id) do update set campus = excluded.campus,
    display_name = excluded.display_name, cards = excluded.cards, published_at = null;
end;
$$;

-- Publishing only accepts a PNG uploaded by this authenticated user.
create function public.release_campus_fish(
  p_name text, p_avatar_path text, p_width integer, p_height integer
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_campus text := campus_private.current_campus();
begin
  if v_user is null or v_campus is null then
    raise exception 'Sign in with a verified campus email.' using errcode = '42501';
  end if;
  if p_avatar_path is null or split_part(p_avatar_path, '/', 1) <> v_user::text
    or not exists (
      select 1 from storage.objects
      where bucket_id = 'campus-fish' and name = p_avatar_path and owner_id = v_user::text
    ) then
    raise exception 'Upload your fish image before publishing.' using errcode = '42501';
  end if;
  if p_width is null or p_height is null or p_width not between 1 and 500 or p_height not between 1 and 320 then
    raise exception 'Invalid fish dimensions.';
  end if;

  insert into public.campus_profiles (id, campus, display_name, avatar_path, avatar_width, avatar_height, published_at)
  values (v_user, v_campus, coalesce(nullif(left(btrim(p_name), 40), ''), 'Little Fish'),
    p_avatar_path, p_width, p_height, now())
  on conflict (id) do update set campus = excluded.campus, avatar_path = excluded.avatar_path,
    avatar_width = excluded.avatar_width, avatar_height = excluded.avatar_height, published_at = excluded.published_at;
end;
$$;

revoke all on function public.campus_membership(), public.save_campus_draft(text, jsonb),
  public.release_campus_fish(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.campus_membership(), public.save_campus_draft(text, jsonb),
  public.release_campus_fish(text, text, integer, integer) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campus-fish', 'campus-fish', false, 1048576, array['image/png']);

create policy campus_avatar_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'campus-fish' and (select campus_private.current_campus()) is not null
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}[.]png$')
  );

create policy campus_avatar_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'campus-fish' and (select campus_private.current_campus()) is not null
    and (
      owner_id = (select auth.uid())::text
      or exists (
        select 1 from public.campus_profiles p
        where p.avatar_path = storage.objects.name
          and p.campus = (select campus_private.current_campus())
          and p.published_at is not null
      )
    )
  );

commit;
