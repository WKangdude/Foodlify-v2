-- Administrative SQL only. Creates a clearly labeled test visit valid for four hours.
-- In production, consume VisitOpened from Dining Room and provision that actual visit.
with token as materialized (
 select replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','') as raw
), branch as (
 select id,tenant_id,slug from public.menu_branches where slug='el-olivo-roma' and published
), visit as (
 insert into public.menu_visits(tenant_id,branch_id,external_visit_id,table_label,area_label,expires_at)
 select tenant_id,id,'menu-pilot-'||gen_random_uuid(),'08 (prueba)','Prueba de integración',now()+interval '4 hours' from branch
 returning id,branch_id,expires_at
), qr as (
 insert into public.menu_qr_tokens(token_hash,branch_id,visit_id,expires_at)
 select encode(sha256(convert_to(token.raw,'UTF8')),'hex'),visit.branch_id,visit.id,visit.expires_at from token cross join visit
 returning visit_id,expires_at
)
select 'http://localhost:3001/?branch='||branch.slug||'&qr='||token.raw as menu_url,qr.expires_at
from qr cross join token cross join branch;
