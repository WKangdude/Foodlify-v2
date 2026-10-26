-- Menu owns published projections and order requests, not canonical kitchen/billing data.
create table public.menu_businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,80}$'),
  name text not null check (length(name) between 1 and 120),
  tagline text not null default '',
  created_at timestamptz not null default now()
);
create table public.menu_branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.menu_businesses(id),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,80}$'),
  name text not null,
  location text not null,
  currency text not null default 'MXN' check (currency = 'MXN'),
  timezone text not null default 'America/Mexico_City',
  published boolean not null default false,
  catalog_version integer not null default 1 check (catalog_version > 0),
  published_at timestamptz,
  unique (tenant_id, id)
);
create index menu_branches_tenant_idx on public.menu_branches(tenant_id);
create table public.menu_categories (
  branch_id uuid not null references public.menu_branches(id),
  id text not null check (length(id) between 1 and 80),
  name text not null check (length(name) between 1 and 100),
  sort_order integer not null default 0,
  primary key (branch_id,id)
);
create table public.menu_products (
  branch_id uuid not null references public.menu_branches(id),
  id text not null check (length(id) between 1 and 80),
  category_id text not null,
  name text not null check (length(name) between 1 and 160),
  description text not null default '',
  price_cents integer not null check (price_cents between 0 and 100000000),
  image_url text not null check (image_url ~ '^https://'),
  tag text,
  vegetarian boolean not null default false,
  available boolean not null default true,
  allergens text[] not null default '{}',
  sort_order integer not null default 0,
  primary key (branch_id,id),
  foreign key (branch_id,category_id) references public.menu_categories(branch_id,id)
);
create index menu_products_category_idx on public.menu_products(branch_id,category_id);
create table public.menu_product_extras (
  branch_id uuid not null,
  product_id text not null,
  id text not null check (length(id) between 1 and 80),
  name text not null,
  price_cents integer not null check (price_cents between 0 and 100000000),
  available boolean not null default true,
  primary key (branch_id,product_id,id),
  foreign key (branch_id,product_id) references public.menu_products(branch_id,id)
);
create table public.menu_visits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  external_visit_id text not null,
  table_label text not null,
  area_label text not null default 'Salón principal',
  status text not null default 'open' check (status in ('open','closed')),
  opened_at timestamptz not null default now(),
  expires_at timestamptz not null,
  foreign key (tenant_id,branch_id) references public.menu_branches(tenant_id,id),
  unique(branch_id,external_visit_id),
  unique(branch_id,id),
  check(expires_at > opened_at)
);
create table public.menu_qr_tokens (
  token_hash text primary key check(length(token_hash)=64),
  branch_id uuid not null,
  visit_id uuid not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  foreign key (branch_id,visit_id) references public.menu_visits(branch_id,id)
);
create index menu_qr_visit_idx on public.menu_qr_tokens(branch_id,visit_id);
create table public.menu_sessions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null,
  visit_id uuid not null,
  token_hash text not null unique check(length(token_hash)=64),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  foreign key (branch_id,visit_id) references public.menu_visits(branch_id,id),
  unique(branch_id,id)
);
create index menu_sessions_visit_idx on public.menu_sessions(branch_id,visit_id,created_at);
create table public.menu_preferences (
  session_id uuid primary key references public.menu_sessions(id),
  favorites text[] not null default '{}' check(cardinality(favorites)<=100),
  vegetarian_only boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.menu_order_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  session_id uuid not null,
  visit_id uuid not null,
  idempotency_key uuid not null,
  request_hash text not null,
  status text not null default 'pending_delivery' check(status in ('pending_delivery','accepted_by_orders','accepted_by_kitchen','rejected','cancelled')),
  catalog_version integer not null,
  currency text not null default 'MXN' check(currency='MXN'),
  total_cents integer not null check(total_cents between 0 and 1000000000),
  created_at timestamptz not null default now(),
  rejection_reason text,
  foreign key (tenant_id,branch_id) references public.menu_branches(tenant_id,id),
  foreign key (branch_id,session_id) references public.menu_sessions(branch_id,id),
  foreign key (branch_id,visit_id) references public.menu_visits(branch_id,id),
  unique(session_id,idempotency_key)
);
create index menu_requests_branch_idx on public.menu_order_requests(tenant_id,branch_id,created_at);
create index menu_requests_visit_idx on public.menu_order_requests(branch_id,visit_id);
create table public.menu_order_items (
  request_id uuid not null references public.menu_order_requests(id),
  id uuid not null,
  product_id text not null,
  product_name text not null,
  quantity integer not null check(quantity between 1 and 20),
  unit_price_cents integer not null check(unit_price_cents>=0),
  extras jsonb not null default '[]' check(jsonb_typeof(extras)='array'),
  note text not null default '' check(length(note)<=300),
  primary key(request_id,id)
);
create table public.message_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  request_id uuid not null unique references public.menu_order_requests(id),
  event_type text not null default 'PlaceOrderRequested',
  schema_version integer not null default 1,
  destination text not null default 'orders',
  payload_xml text not null,
  status text not null default 'pending' check(status in ('pending','publishing','published','hospital')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  locked_until timestamptz,
  lease_token uuid,
  foreign key(tenant_id,branch_id) references public.menu_branches(tenant_id,id)
);
create index menu_outbox_pending_idx on public.message_outbox(created_at) where status='pending';
create index menu_outbox_branch_idx on public.message_outbox(tenant_id,branch_id);
create table public.message_inbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  consumer text not null default 'menu',
  event_id text not null,
  event_type text not null,
  aggregate_id text not null,
  aggregate_version integer not null check(aggregate_version>0),
  payload_hash text not null,
  processed_at timestamptz not null default now(),
  foreign key(tenant_id,branch_id) references public.menu_branches(tenant_id,id),
  unique(tenant_id,consumer,event_id)
);
create index menu_inbox_branch_idx on public.message_inbox(tenant_id,branch_id);
create table public.message_hospital (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  branch_id uuid,
  event_id text,
  event_type text,
  correlation_id text,
  aggregate_id text,
  aggregate_version integer,
  application text not null default 'menu',
  consumer text not null default 'menu',
  direction text not null check(direction in ('inbound','outbound')),
  destination text not null,
  transport_message_id text,
  deduplication_key text not null unique,
  payload_cipher text not null,
  payload_hash text not null,
  safe_headers jsonb not null default '{}',
  status text not null default 'pending' check(status in ('pending','retrying','resolved','exhausted','blocked','discarded')),
  error_category text not null,
  error_code text not null,
  last_error text not null,
  retryable boolean not null default true,
  retry_count integer not null default 0 check(retry_count>=0),
  max_retries integer not null default 5 check(max_retries>=0),
  base_interval_seconds integer not null default 2 check(base_interval_seconds>0),
  backoff_multiplier numeric not null default 2 check(backoff_multiplier>=1),
  max_interval_seconds integer not null default 60 check(max_interval_seconds>0),
  jitter_percent integer not null default 20 check(jitter_percent between 0 and 100),
  next_retry_at timestamptz,
  last_retry_at timestamptz,
  policy_version text not null default 'v1',
  locked_by text,
  locked_until timestamptz,
  lease_token uuid,
  first_failed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text,
  resolved_by text,
  redrive_generation integer not null default 0,
  foreign key(tenant_id,branch_id) references public.menu_branches(tenant_id,id)
);
create index menu_hospital_due_idx on public.message_hospital(status,next_retry_at);
create index menu_hospital_scope_idx on public.message_hospital(tenant_id,branch_id,first_failed_at);
create table public.message_hospital_attempt (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.message_hospital(id),
  generation integer not null,
  attempt_number integer not null check(attempt_number>0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  worker text not null,
  outcome text not null check(outcome in ('running','succeeded','failed','interrupted')),
  error_code text,
  safe_error text,
  duration_ms integer,
  actor text,
  unique(hospital_id,generation,attempt_number)
);
-- Explicit grants override Supabase's historical automatic public privileges.
do $$
declare t text;
begin
 foreach t in array array['menu_businesses','menu_branches','menu_categories','menu_products','menu_product_extras','menu_visits','menu_qr_tokens','menu_sessions','menu_preferences','menu_order_requests','menu_order_items','message_outbox','message_inbox','message_hospital','message_hospital_attempt'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on table public.%I from public, anon, authenticated',t);
  execute format('grant select, insert, update, delete on table public.%I to service_role',t);
 end loop;
end $$;
grant select on public.menu_businesses, public.menu_branches, public.menu_categories, public.menu_products, public.menu_product_extras to anon,authenticated;
create policy published_businesses on public.menu_businesses for select to anon,authenticated using (exists(select 1 from public.menu_branches b where b.tenant_id=menu_businesses.id and b.published));
create policy published_branches on public.menu_branches for select to anon,authenticated using(published);
create policy published_categories on public.menu_categories for select to anon,authenticated using(exists(select 1 from public.menu_branches b where b.id=menu_categories.branch_id and b.published));
create policy published_products on public.menu_products for select to anon,authenticated using(exists(select 1 from public.menu_branches b where b.id=menu_products.branch_id and b.published));
create policy published_extras on public.menu_product_extras for select to anon,authenticated using(exists(select 1 from public.menu_branches b where b.id=menu_product_extras.branch_id and b.published));

create function public.menu_open_session(p_qr_hash text,p_session_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.menu_qr_tokens; v public.menu_visits; s public.menu_sessions;
begin
 select * into q from public.menu_qr_tokens where token_hash=p_qr_hash and revoked_at is null and expires_at>now();
 if not found then raise exception 'INVALID_QR'; end if;
 select * into v from public.menu_visits where id=q.visit_id and branch_id=q.branch_id and status='open' and expires_at>now() for update;
 if not found or not exists(select 1 from public.menu_branches where id=v.branch_id and published) then raise exception 'VISIT_CLOSED'; end if;
 if (select count(*) from public.menu_sessions where visit_id=v.id and branch_id=v.branch_id and created_at>now()-interval '1 hour')>=40 then raise exception 'SESSION_LIMIT'; end if;
 insert into public.menu_sessions(branch_id,visit_id,token_hash,expires_at) values(v.branch_id,v.id,p_session_hash,least(q.expires_at,v.expires_at,now()+interval '4 hours')) returning * into s;
 return jsonb_build_object('id',s.id,'branchId',s.branch_id,'tableLabel',v.table_label,'areaLabel',v.area_label,'expiresAt',s.expires_at);
end $$;
revoke all on function public.menu_open_session(text,text) from public,anon,authenticated;
grant execute on function public.menu_open_session(text,text) to service_role;

create function public.menu_submit_order(p_session_hash text,p_key uuid,p_items jsonb,p_expected_total integer)
returns uuid language plpgsql security invoker set search_path='' as $$
declare s public.menu_sessions; v public.menu_visits; b public.menu_branches; old public.menu_order_requests; p public.menu_products; e public.menu_product_extras; line jsonb; extra_id text; price integer; total bigint:=0; snapshot jsonb:='[]'; extras jsonb; request_id uuid; event_id uuid:=gen_random_uuid(); fingerprint text; line_id uuid; items_xml xml;
begin
 select * into s from public.menu_sessions where token_hash=p_session_hash and revoked_at is null and expires_at>now() for update;
 if not found then raise exception 'INVALID_SESSION'; end if;
 select * into v from public.menu_visits where id=s.visit_id and branch_id=s.branch_id and status='open' and expires_at>now() for share;
 if not found then raise exception 'VISIT_CLOSED'; end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('items',p_items,'total',p_expected_total)::text,'UTF8')),'hex');
 select * into old from public.menu_order_requests where session_id=s.id and idempotency_key=p_key;
 if found then
  if old.request_hash<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return old.id;
 end if;
 if (select count(*) from public.menu_order_requests where session_id=s.id and created_at>now()-interval '1 minute')>=5 then raise exception 'ORDER_LIMIT'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'INVALID_ITEMS'; end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) then raise exception 'INVALID_ITEMS'; end if;
 select * into b from public.menu_branches where id=s.branch_id and published for share;
 if not found then raise exception 'MENU_UNAVAILABLE'; end if;
 for line in select * from jsonb_array_elements(p_items) loop
  if jsonb_typeof(line->'quantity')<>'number' or (line->>'quantity')!~'^[0-9]+$' or (line->>'quantity')::integer not between 1 and 20 or jsonb_typeof(line->'note')<>'string' or length(line->>'note')>300 or jsonb_typeof(line->'extraIds')<>'array' or jsonb_array_length(line->'extraIds')>20 or not(line ? 'id' and line ? 'productId' and line ? 'quantity' and line ? 'note' and line ? 'extraIds') then raise exception 'INVALID_ITEMS'; end if;
  line_id:=(line->>'id')::uuid;
  select * into p from public.menu_products where branch_id=b.id and id=line->>'productId' and available for share;
  if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
  price:=p.price_cents; extras:='[]';
  if (select count(distinct value) from jsonb_array_elements_text(line->'extraIds'))<>jsonb_array_length(line->'extraIds') then raise exception 'INVALID_EXTRAS'; end if;
  for extra_id in select jsonb_array_elements_text(line->'extraIds') loop
   select * into e from public.menu_product_extras where branch_id=b.id and product_id=p.id and id=extra_id and available for share;
   if not found then raise exception 'INVALID_EXTRAS'; end if;
   price:=price+e.price_cents;
   extras:=extras||jsonb_build_array(jsonb_build_object('id',e.id,'name',e.name,'price',e.price_cents));
  end loop;
  total:=total+price*(line->>'quantity')::integer;
  snapshot:=snapshot||jsonb_build_array(jsonb_build_object('id',line_id,'productId',p.id,'productName',p.name,'quantity',(line->>'quantity')::integer,'unitPrice',price,'extras',extras,'extraIds',line->'extraIds','note',line->>'note'));
 end loop;
 if total>1000000000 then raise exception 'ORDER_TOO_LARGE'; end if;
 if p_expected_total is null or total<>p_expected_total then raise exception 'PRICE_CHANGED'; end if;
 insert into public.menu_order_requests(tenant_id,branch_id,session_id,visit_id,idempotency_key,request_hash,catalog_version,total_cents) values(b.tenant_id,b.id,s.id,v.id,p_key,fingerprint,b.catalog_version,total) returning id into request_id;
 insert into public.menu_order_items(request_id,id,product_id,product_name,quantity,unit_price_cents,extras,note)
 select request_id,(x->>'id')::uuid,x->>'productId',x->>'productName',(x->>'quantity')::integer,(x->>'unitPrice')::integer,x->'extras',x->>'note' from jsonb_array_elements(snapshot) x;
 select xmlelement(name "Items",xmlagg(xmlelement(name "Item",xmlattributes(x->>'id' as "lineId"),
   xmlelement(name "ProductId",x->>'productId'),xmlelement(name "Name",x->>'productName'),
   xmlelement(name "Quantity",x->>'quantity'),xmlelement(name "UnitPrice",xmlattributes('MXN' as "currency"),(x->>'unitPrice')::numeric/100),
   xmlelement(name "Notes",x->>'note'),xmlelement(name "Extras",(select xmlagg(xmlelement(name "Extra",xmlattributes(z->>'id' as "id"),xmlelement(name "Name",z->>'name'),xmlelement(name "Price",(z->>'price')::numeric/100))) from jsonb_array_elements(x->'extras') z)))))
 into items_xml from jsonb_array_elements(snapshot) x;
 insert into public.message_outbox(id,tenant_id,branch_id,request_id,payload_xml)
 values(event_id,b.tenant_id,b.id,request_id,xmlserialize(content xmlelement(name "Command",xmlattributes('urn:foodlify:menu:v1' as "xmlns",event_id as "eventId",'PlaceOrderRequested' as "eventType",1 as "schemaVersion",b.tenant_id as "tenantId",b.id as "branchId",'menu' as "source",now() as "occurredAt",request_id as "correlationId",request_id as "aggregateId",1 as "aggregateVersion"),xmlelement(name "VisitId",v.external_visit_id),items_xml) as text));
 return request_id;
end $$;
revoke all on function public.menu_submit_order(text,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.menu_submit_order(text,uuid,jsonb,integer) to service_role;
