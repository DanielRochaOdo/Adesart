with alvo(cpf) as (
  values
    ('00092043348'),
    ('00985929391'),
    ('03521839346'),
    ('04142905341'),
    ('05052361335'),
    ('06731698393'),
    ('06854679370'),
    ('06867310346'),
    ('06872234318'),
    ('07017488342'),
    ('07295303375'),
    ('07295946373'),
    ('07328439360'),
    ('07452953398'),
    ('07545448340'),
    ('07636383314'),
    ('07647835300'),
    ('07705536307'),
    ('07718865355'),
    ('07831807306'),
    ('07834915304'),
    ('07948259317'),
    ('07969049362'),
    ('07994309356'),
    ('08260402335'),
    ('08282759392'),
    ('08285607305'),
    ('08314031364'),
    ('08398803320'),
    ('08423041344'),
    ('08470044303'),
    ('08568977367'),
    ('08595005354'),
    ('08632139363'),
    ('08673170354'),
    ('08681427350'),
    ('08736885380'),
    ('08738316323'),
    ('08754593310'),
    ('08899861340'),
    ('08975945332'),
    ('09104894324'),
    ('09162511360'),
    ('09166924340'),
    ('09179952364'),
    ('09180100392'),
    ('09194725322'),
    ('09199825309'),
    ('09254871397'),
    ('09320568308'),
    ('09359925373'),
    ('09409593301'),
    ('09469980352'),
    ('09540639379'),
    ('09572409379'),
    ('09585250306'),
    ('09645127343'),
    ('09652190381'),
    ('09897783393'),
    ('09998826357'),
    ('10006004326'),
    ('10020183313'),
    ('10150197306'),
    ('10219186367'),
    ('10226285340'),
    ('10279558350'),
    ('10342099302'),
    ('10344791300'),
    ('10366595342'),
    ('10402196325'),
    ('10472675354'),
    ('10526037342'),
    ('10593032489'),
    ('10645162388'),
    ('10697660389'),
    ('10751167320'),
    ('10834928370'),
    ('11279436344'),
    ('11331092337'),
    ('11524330329'),
    ('11540130304'),
    ('11600846378'),
    ('11631037307'),
    ('11661952364'),
    ('11907214305'),
    ('11934884359'),
    ('12463033371'),
    ('12664665332'),
    ('13370779412'),
    ('14227791499'),
    ('14920052405'),
    ('47745584353'),
    ('55014385850'),
    ('60632587369'),
    ('60814868347'),
    ('60963510347'),
    ('61552089304'),
    ('62155794320'),
    ('62166673350'),
    ('62202373314'),
    ('62311151355'),
    ('62342237375'),
    ('62398754308'),
    ('62407370384'),
    ('62436240302'),
    ('62493633350'),
    ('62512548317'),
    ('62698070340'),
    ('62704836388'),
    ('62776512341'),
    ('62800746335'),
    ('62811848312'),
    ('62838386344'),
    ('62861759380'),
    ('62890017362'),
    ('62894884303'),
    ('63066603300'),
    ('63067128362'),
    ('63081737389'),
    ('63092322312'),
    ('63136571363'),
    ('63154947302'),
    ('63169473301'),
    ('63211811370'),
    ('63220540317'),
    ('63290497348'),
    ('63338336306'),
    ('63339477337'),
    ('63569330389'),
    ('63570976327'),
    ('63738811303'),
    ('63891596332'),
    ('75188214350'),
    ('84359225377')
), cad as (
  select
    c.id,
    regexp_replace(coalesce(c.cpf,''), '\\D', '', 'g') as cpf,
    c.created_at,
    c.status,
    c.tipo_cadastro,
    nullif(regexp_replace(coalesce(c.endereco->>'cep',''), '\\D', '', 'g'),'') as cep_endereco,
    nullif(regexp_replace(coalesce(c.payload_erp->'dados'->'responsavelFinanceiro'->'endereco'->>'cep',''), '\\D', '', 'g'),'') as cep_payload
  from cadastros c
), logs as (
  select
    nullif(request_body->>'cadastro_id','')::uuid as cadastro_id,
    nullif(regexp_replace(coalesce(request_body->'dados'->'responsavelFinanceiro'->'endereco'->>'cep',''), '\\D', '', 'g'),'') as cep_log,
    created_at,
    success,
    endpoint
  from api_logs
  where endpoint = 'erp-novo-usuario2'
), cad_with_logs as (
  select
    c.*,
    l.cep_log,
    l.created_at as log_created_at,
    l.success as log_success,
    row_number() over (partition by c.id order by l.created_at asc nulls last) as log_rn
  from cad c
  left join logs l on l.cadastro_id = c.id
), first_cpf as (
  select c.*, row_number() over (partition by c.cpf order by c.created_at asc) as rn
  from cad c
  join alvo a on a.cpf = c.cpf
), first_cpf_row as (
  select * from first_cpf where rn=1
), sent_stats as (
  select
    c.cpf,
    count(*) filter (where l.cadastro_id is not null) as qtd_chamadas_api,
    count(*) filter (where l.cadastro_id is not null and l.cep_log is not null) as qtd_chamadas_com_cep,
    count(*) filter (where l.cadastro_id is not null and l.cep_log is null) as qtd_chamadas_sem_cep
  from cad c
  left join logs l on l.cadastro_id = c.id
  join alvo a on a.cpf = c.cpf
  group by c.cpf
)
select
  a.cpf,
  (f.created_at at time zone 'America/Fortaleza')::timestamp as primeiro_cadastro_data,
  f.status as primeiro_status,
  f.cep_endereco as cep_no_cadastro,
  f.cep_payload as cep_no_payload,
  coalesce(s.qtd_chamadas_api,0) as chamadas_erp,
  coalesce(s.qtd_chamadas_com_cep,0) as chamadas_erp_com_cep,
  coalesce(s.qtd_chamadas_sem_cep,0) as chamadas_erp_sem_cep,
  case
    when coalesce(s.qtd_chamadas_api,0)=0 then 'NAO_ENVIADO_AINDA'
    when coalesce(s.qtd_chamadas_com_cep,0)>0 then 'ENVIADO_COM_CEP'
    else 'ENVIADO_SEM_CEP'
  end as diagnostico
from alvo a
left join first_cpf_row f on f.cpf = a.cpf
left join sent_stats s on s.cpf = a.cpf
order by a.cpf;