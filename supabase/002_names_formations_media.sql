-- Applied 2026-11-06 to the live project.
alter table players add column if not exists full_name text;  -- official name; display_name is what the site shows (e.g. "Tata")

update teams set formation = v.f from (values ('alba','2-4-1'),('kid','2-4-1'),('par','3-2-2'),('kal','3-1-3'),('wan','3-3-1'),('aq','2-3-2'),('bas','3-2-2'),('alx','3-1-3')) v(slug, f)
where teams.slug = v.slug;

-- Public photo bucket; only admins can upload or delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy media_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.is_admin());
create policy media_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'media' and public.is_admin());

-- 2026-11-06 later: Parceros switched to 3-3-1, Wanderers to 3-2-2; real names added (Parceros, Kal United, Kidston,
-- Wanderers, Alexanders) and Parceros' scorers for w4-1 entered directly. Data changes only; see admin history.

-- Team badges (optional image URL; falls back to the colour crest)
alter table teams add column if not exists badge_url text;
