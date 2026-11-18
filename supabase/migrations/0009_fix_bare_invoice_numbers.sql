-- 0009: Faturas emitidas pelo programa de faturação antes desta correção ficavam gravadas só com o
-- número interno do programa (ex.: "0" num rascunho de teste, ou "205" sem série). Vários rascunhos
-- davam todos "0" e o segundo falhava com "Esse número de documento já existe".
-- Passa esses números para um formato único: "Rascunho #<id externo>" (ou "#<número> (<id externo>)").
-- Só mexe em obras que NÃO são histórico importado e cujo número é apenas dígitos.
-- Idempotente: depois de correr, nenhum número fica só com dígitos.
with fix as (
  select o.company_id, o.id, o.invoice_number,
         (select l.response_json->>'externalId'
            from public.invoice_logs l
           where l.company_id = o.company_id and l.order_id = o.id
             and coalesce(l.response_json->>'externalId', '') <> ''
           order by l.created_at desc limit 1) as external_id
  from public.orders o
  where o.invoice_number ~ '^\d+$'
    and coalesce(o.invoice_provider, '') <> 'Histórico importado'
)
update public.orders o
set invoice_number = case
      when fix.invoice_number = '0' then 'Rascunho #' || coalesce(fix.external_id, o.id)
      else '#' || fix.invoice_number || ' (' || coalesce(fix.external_id, o.id) || ')'
    end,
    updated_at = now()
from fix
where o.company_id = fix.company_id and o.id = fix.id;

update public.invoice_logs l
set document_number = o.invoice_number
from public.orders o
where l.company_id = o.company_id and l.order_id = o.id
  and l.document_number ~ '^\d+$'
  and o.invoice_number !~ '^\d+$';
