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
begin
  if p_report is null or jsonb_typeof(p_report) <> 'object' then
    raise exception 'Relatório inválido.';
  end if;

  if jsonb_typeof(coalesce(p_report->'deviations', '[]'::jsonb)) <> 'array' then
    raise exception 'A lista de desvios deve ser um array.';
  end if;

  v_shift := auth.jwt()->'user_metadata'->>'shift';
  v_reporter := auth.jwt()->'user_metadata'->>'display_name';
  if v_shift not in ('TN', 'TM', 'TT') or nullif(btrim(v_reporter), '') is null then
    raise exception 'Conta de turno IMIQ inválida.';
  end if;

  insert into public.imq_reports (
    id, owner_id, report_date, shift, reporter, status, reviewed,
    general_observation, deviation_count
  ) values (
    coalesce(nullif(p_report->>'id', '')::uuid, gen_random_uuid()),
    (select auth.uid()),
    (p_report->>'report_date')::date,
    v_shift,
    v_reporter,
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
