-- Transactional verification. No test visits, orders, or messages survive rollback.
begin;
do $$
declare b public.menu_branches; v uuid; s jsonb; req uuid; again uuid; k uuid:=gen_random_uuid(); line uuid:=gen_random_uuid(); items jsonb; amount integer; outboxes integer;
begin
 select * into strict b from public.menu_branches where slug='el-olivo-roma';
 insert into public.menu_visits(tenant_id,branch_id,external_visit_id,table_label,expires_at) values(b.tenant_id,b.id,'sql-test-'||gen_random_uuid(),'Prueba SQL',now()+interval '1 hour') returning id into v;
 insert into public.menu_qr_tokens(token_hash,branch_id,visit_id,expires_at) values(repeat('a',64),b.id,v,now()+interval '1 hour');
 s:=public.menu_open_session(repeat('a',64),repeat('b',64));
 if s->>'tableLabel'<>'Prueba SQL' then raise exception 'QR session scope failed'; end if;
 select price_cents into amount from public.menu_products where branch_id=b.id and id='pasta';
 amount:=(amount+6500+2500)*2;
 items:=jsonb_build_array(jsonb_build_object('id',line,'productId','pasta','quantity',2,'extraIds',jsonb_build_array('pollo','parmesano'),'note','Sin sal < & >'));
 req:=public.menu_submit_order(repeat('b',64),k,items,amount);
 again:=public.menu_submit_order(repeat('b',64),k,items,amount);
 if req<>again then raise exception 'Idempotency failed'; end if;
 if(select count(*) from public.message_outbox where request_id=req)<>1 then raise exception 'Outbox duplicated'; end if;
 if not(select xml_is_well_formed_document(payload_xml) from public.message_outbox where request_id=req) then raise exception 'Invalid XML'; end if;
 if(select total_cents from public.menu_order_requests where id=req)<>65000 then raise exception 'Price calculation failed'; end if;
 select count(*) into outboxes from public.message_outbox;
 begin
  perform public.menu_submit_order(repeat('b',64),gen_random_uuid(),items,1);
  raise exception 'Tampered price accepted';
 exception when raise_exception then if sqlerrm<>'PRICE_CHANGED' then raise; end if; end;
 begin
  perform public.menu_submit_order(repeat('b',64),k,jsonb_set(items,'{0,note}','"Changed"'),amount);
  raise exception 'Conflicting idempotency accepted';
 exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
 begin
  perform public.menu_submit_order(repeat('b',64),gen_random_uuid(),jsonb_set(items,'{0,extraIds}','["tocino"]'),amount);
  raise exception 'Cross-product extra accepted';
 exception when raise_exception then if sqlerrm<>'INVALID_EXTRAS' then raise; end if; end;
 begin
  perform public.menu_submit_order(repeat('b',64),gen_random_uuid(),jsonb_set(items,'{0,productId}','"toast"'),amount);
  raise exception 'Unavailable product accepted';
 exception when raise_exception then if sqlerrm<>'PRODUCT_UNAVAILABLE' then raise; end if; end;
 begin
  perform public.menu_submit_order(repeat('c',64),gen_random_uuid(),items,amount);
  raise exception 'Foreign session accepted';
 exception when raise_exception then if sqlerrm<>'INVALID_SESSION' then raise; end if; end;
 if(select count(*) from public.message_outbox)<>outboxes then raise exception 'Failed order created a message'; end if;
 update public.menu_products set price_cents=price_cents+10000 where branch_id=b.id and id='pasta';
 if(select total_cents from public.menu_order_requests where id=req)<>65000 or (select unit_price_cents from public.menu_order_items where request_id=req)<>32500 then raise exception 'Agreed prices changed'; end if;
 update public.menu_visits set status='closed' where id=v;
 begin
  perform public.menu_submit_order(repeat('b',64),gen_random_uuid(),items,amount);
  raise exception 'Closed visit accepted';
 exception when raise_exception then if sqlerrm<>'VISIT_CLOSED' then raise; end if; end;
 if has_table_privilege('anon','public.menu_sessions','select') or has_table_privilege('authenticated','public.menu_order_requests','select') or has_function_privilege('anon','public.menu_submit_order(text,uuid,jsonb,integer)','execute') or has_table_privilege('anon','public.menu_products','insert') then raise exception 'Excessive public privileges'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity) then raise exception 'Table without RLS'; end if;
end $$;
set local role anon;
select count(*) as published_products_visible_to_anon from public.menu_products;
reset role;
rollback;
