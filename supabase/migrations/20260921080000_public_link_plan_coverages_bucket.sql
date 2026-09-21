-- PDFs de cobertura do fluxo de adesao por Link: 18 Multiprev, 19 Multiplus, 20 Multimaster.
-- Publicacao dos 3 arquivos originais: plan-coverages/18.pdf, 19.pdf, 20.pdf.
-- Upload administrativo pelo Storage; nenhum usuario anonimo pode gravar ou sobrescrever.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plan-coverages', 'plan-coverages', true, 5242880, array['application/pdf']::text[])
on conflict (id) do update
set public = true, file_size_limit = 5242880, allowed_mime_types = array['application/pdf']::text[];
