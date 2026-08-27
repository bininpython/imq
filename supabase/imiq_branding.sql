comment on table public.imq_reports is
  'IMIQ - Inspeção: fechamentos de inspeção por turno';

comment on table public.imq_deviations is
  'IMIQ - Inspeção: desvios registrados nos fechamentos';

comment on table public.imq_attachments is
  'IMIQ - Inspeção: metadados das evidências armazenadas';

comment on table public.imq_shift_accounts is
  'IMIQ - Inspeção: contas operacionais TN, TM e TT';

comment on function public.create_imq_report(jsonb) is
  'IMIQ - Inspeção: finaliza relatório e persiste desvios e evidências';
