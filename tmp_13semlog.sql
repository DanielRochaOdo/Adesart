with cpfs(cpf) as (
 values
 ('00092043348'),('04142905341'),('05052361335'),('06854679370'),('07831807306'),('08260402335'),('08470044303'),('08595005354'),('08738316323'),('47745584353'),('62311151355'),('62894884303'),('63569330389')
)
select regexp_replace(coalesce(c.cpf,''), '\\D', '', 'g') as cpf,
       c.id,
       c.status,
       c.tipo_cadastro,
       c.created_at,
       nullif(regexp_replace(coalesce(c.endereco->>'cep',''), '\\D', '', 'g'),'') as cep_endereco,
       nullif(regexp_replace(coalesce(c.payload_erp->'dados'->'responsavelFinanceiro'->'endereco'->>'cep',''), '\\D', '', 'g'),'') as cep_payload
from cadastros c
join cpfs p on p.cpf = regexp_replace(coalesce(c.cpf,''), '\\D', '', 'g')
order by cpf, created_at;