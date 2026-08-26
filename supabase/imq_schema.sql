create table public.imq_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  report_date date not null,
  shift text not null check (shift in ('TN', 'TM', 'TT')),
  reporter text not null check (char_length(btrim(reporter)) between 2 and 120),
  inspector_name text not null default '' check (char_length(btrim(inspector_name)) between 0 and 120),
  status text not null default 'finalizado' check (status in ('rascunho', 'finalizado')),
  reviewed jsonb not null default '[]'::jsonb check (jsonb_typeof(reviewed) = 'array'),
  general_observation text not null default '',
  deviation_count integer not null default 0 check (deviation_count >= 0),
  created_at timestamptz not null default now()
);

create table public.imq_deviations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.imq_reports(id) on delete cascade,
  area text not null check (area in ('ITIF', 'ITIQ', 'ITIL', 'ITIA')),
  passage_equipment text not null,
  passage_equipment_code text not null,
  destination_equipment text not null,
  destination_equipment_code text not null,
  um text not null check (um ~ '^[A-Z0-9]{8,20}$'),
  defect_code text not null,
  defect_name text not null,
  observation text not null default '',
  created_at timestamptz not null default now()
);

create table public.imq_attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.imq_reports(id) on delete cascade,
  deviation_id uuid not null references public.imq_deviations(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  content_type text not null check (content_type like 'image/%' or content_type like 'video/%'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  created_at timestamptz not null default now()
);

create table public.imq_shift_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  shift text not null unique check (shift in ('TN', 'TM', 'TT')),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index imq_reports_date_created_idx
  on public.imq_reports (report_date desc, created_at desc);
create index imq_reports_owner_date_idx
  on public.imq_reports (owner_id, report_date desc, created_at desc);
create index imq_reports_shift_date_idx
  on public.imq_reports (shift, report_date desc);
create index imq_deviations_report_id_idx
  on public.imq_deviations (report_id);
create index imq_deviations_defect_code_idx
  on public.imq_deviations (defect_code);
create index imq_deviations_destination_idx
  on public.imq_deviations (destination_equipment);
create index imq_attachments_report_id_idx
  on public.imq_attachments (report_id);
create index imq_attachments_deviation_id_idx
  on public.imq_attachments (deviation_id);

alter table public.imq_reports enable row level security;
alter table public.imq_deviations enable row level security;
alter table public.imq_attachments enable row level security;
alter table public.imq_shift_accounts enable row level security;

grant usage on schema public to authenticated;
grant select, insert on public.imq_reports to authenticated;
grant select, insert on public.imq_deviations to authenticated;
grant select, insert on public.imq_attachments to authenticated;
grant select on public.imq_shift_accounts to authenticated;

create policy "imq reports readable"
  on public.imq_reports for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "imq reports insertable"
  on public.imq_reports for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "imq deviations readable"
  on public.imq_deviations for select to authenticated
  using (exists (
    select 1 from public.imq_reports report
    where report.id = report_id and report.owner_id = (select auth.uid())
  ));
create policy "imq deviations insertable"
  on public.imq_deviations for insert to authenticated
  with check (exists (
    select 1 from public.imq_reports report
    where report.id = report_id and report.owner_id = (select auth.uid())
  ));
create policy "imq attachments readable"
  on public.imq_attachments for select to authenticated
  using (exists (
    select 1 from public.imq_reports report
    where report.id = report_id and report.owner_id = (select auth.uid())
  ));
create policy "imq attachments insertable"
  on public.imq_attachments for insert to authenticated
  with check (exists (
    select 1 from public.imq_reports report
    where report.id = report_id and report.owner_id = (select auth.uid())
  ));
create policy "imq shift accounts readable"
  on public.imq_shift_accounts for select to authenticated
  using ((select auth.uid()) = user_id);

insert into public.imq_shift_accounts (user_id, shift, display_name)
select id,
  case email
    when 'tn@imq.app' then 'TN'
    when 'tm@imq.app' then 'TM'
    when 'tt@imq.app' then 'TT'
  end as shift,
  case email
    when 'tn@imq.app' then 'Inspetor Líder TN'
    when 'tm@imq.app' then 'Inspetor Líder TM'
    when 'tt@imq.app' then 'Inspetor Líder TT'
  end as display_name
from auth.users
where email in ('tn@imq.app', 'tm@imq.app', 'tt@imq.app')
on conflict (user_id) do update set
  shift = excluded.shift,
  display_name = excluded.display_name,
  updated_at = now();

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
  'shift',
  case email
    when 'tn@imq.app' then 'TN'
    when 'tm@imq.app' then 'TM'
    when 'tt@imq.app' then 'TT'
  end,
  'display_name',
  case email
    when 'tn@imq.app' then 'Inspetor Líder TN'
    when 'tm@imq.app' then 'Inspetor Líder TM'
    when 'tt@imq.app' then 'Inspetor Líder TT'
  end
)
where email in ('tn@imq.app', 'tm@imq.app', 'tt@imq.app');

create or replace function public.create_imq_report(p_report jsonb)
returns public.imq_reports
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_report public.imq_reports;
  v_deviation jsonb;
  v_attachment jsonb;
  v_deviation_id uuid;
  v_shift text;
  v_reporter text;
  v_inspector_name text;
begin
  if p_report is null or jsonb_typeof(p_report) <> 'object' then
    raise exception 'Relatório inválido.';
  end if;

  if jsonb_typeof(coalesce(p_report->'deviations', '[]'::jsonb)) <> 'array' then
    raise exception 'A lista de desvios deve ser um array.';
  end if;

  select account.shift, account.display_name
    into v_shift, v_reporter
  from public.imq_shift_accounts account
  where account.user_id = (select auth.uid());

  if v_shift not in ('TN', 'TM', 'TT') or nullif(btrim(v_reporter), '') is null then
    raise exception 'Conta de turno IMQ inválida.';
  end if;

  v_inspector_name := coalesce(nullif(btrim(p_report->>'inspector_name'), ''), v_reporter);
  if char_length(v_inspector_name) not between 2 and 120 then
    raise exception 'Nome do inspetor inválido.';
  end if;

  insert into public.imq_reports (
    id, owner_id, report_date, shift, reporter, inspector_name, status, reviewed,
    general_observation, deviation_count
  ) values (
    coalesce(nullif(p_report->>'id', '')::uuid, gen_random_uuid()),
    (select auth.uid()),
    (p_report->>'report_date')::date,
    v_shift,
    v_reporter,
    v_inspector_name,
    coalesce(nullif(p_report->>'status', ''), 'finalizado'),
    coalesce(p_report->'reviewed', '[]'::jsonb),
    coalesce(p_report->>'general_observation', ''),
    jsonb_array_length(coalesce(p_report->'deviations', '[]'::jsonb))
  )
  returning * into v_report;

  for v_deviation in
    select value from jsonb_array_elements(coalesce(p_report->'deviations', '[]'::jsonb))
  loop
    v_deviation_id := coalesce(nullif(v_deviation->>'id', '')::uuid, gen_random_uuid());

    insert into public.imq_deviations (
      id, report_id, area, passage_equipment, passage_equipment_code,
      destination_equipment, destination_equipment_code, um,
      defect_code, defect_name, observation
    ) values (
      v_deviation_id,
      v_report.id,
      v_deviation->>'area',
      v_deviation->>'passage_equipment',
      v_deviation->>'passage_equipment_code',
      v_deviation->>'destination_equipment',
      v_deviation->>'destination_equipment_code',
      upper(v_deviation->>'um'),
      v_deviation->>'defect_code',
      v_deviation->>'defect_name',
      coalesce(v_deviation->>'observation', '')
    );

    for v_attachment in
      select value from jsonb_array_elements(coalesce(v_deviation->'attachments', '[]'::jsonb))
    loop
      insert into public.imq_attachments (
        id, report_id, deviation_id, storage_path,
        file_name, content_type, size_bytes
      ) values (
        coalesce(nullif(v_attachment->>'id', '')::uuid, gen_random_uuid()),
        v_report.id,
        v_deviation_id,
        v_attachment->>'storage_path',
        v_attachment->>'file_name',
        v_attachment->>'content_type',
        (v_attachment->>'size_bytes')::bigint
      );
    end loop;
  end loop;

  return v_report;
end;
$$;

revoke all on function public.create_imq_report(jsonb) from public;
grant execute on function public.create_imq_report(jsonb) to authenticated;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'imq-evidencias',
  'imq-evidencias',
  false,
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/mpeg', 'video/x-m4v'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "imq evidence upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'imq-evidencias'
    and (storage.foldername(name))[1] = 'reports'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy "imq evidence download"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'imq-evidencias'
    and (storage.foldername(name))[1] = 'reports'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy "imq evidence cleanup"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'imq-evidencias'
    and (storage.foldername(name))[1] = 'reports'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
