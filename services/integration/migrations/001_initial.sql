CREATE TABLE IF NOT EXISTS integration_receipt (
  tenant_id text NOT NULL,
  principal_id text NOT NULL,
  transport_message_id text NOT NULL,
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, principal_id, transport_message_id)
);

CREATE TABLE IF NOT EXISTS message_inbox (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  branch_id text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  source text NOT NULL,
  aggregate_id text NOT NULL,
  aggregate_version integer NOT NULL CHECK (aggregate_version > 0),
  correlation_id text NOT NULL,
  payload_hash text NOT NULL,
  payload_cipher text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, event_id)
);

CREATE TABLE IF NOT EXISTS message_outbox (
  id uuid PRIMARY KEY,
  inbox_id uuid NOT NULL REFERENCES message_inbox(id),
  tenant_id text NOT NULL,
  branch_id text NOT NULL,
  event_id text NOT NULL,
  destination text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','publishing','hospital','published')),
  lease_token uuid,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (inbox_id, destination)
);
CREATE INDEX IF NOT EXISTS outbox_pending ON message_outbox (created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS outbox_leases ON message_outbox (locked_until) WHERE status = 'publishing';

CREATE TABLE IF NOT EXISTS message_hospital (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  branch_id text NOT NULL,
  application text NOT NULL DEFAULT 'integration',
  consumer text NOT NULL DEFAULT 'integration',
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  destination text NOT NULL,
  event_id text,
  event_type text,
  correlation_id text,
  transport_message_id text NOT NULL,
  deduplication_key text NOT NULL UNIQUE,
  outbox_id uuid REFERENCES message_outbox(id),
  payload_cipher text NOT NULL,
  payload_hash text NOT NULL,
  principal jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','retrying','resolved','exhausted','blocked','discarded')),
  retryable boolean NOT NULL,
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries integer NOT NULL CHECK (max_retries >= 0),
  base_interval_seconds double precision NOT NULL CHECK (base_interval_seconds > 0),
  backoff_multiplier double precision NOT NULL CHECK (backoff_multiplier >= 1),
  max_interval_seconds double precision NOT NULL CHECK (max_interval_seconds > 0),
  jitter_percent double precision NOT NULL CHECK (jitter_percent BETWEEN 0 AND 100),
  policy_version text NOT NULL DEFAULT 'v1',
  error_code text NOT NULL,
  last_error text NOT NULL,
  next_retry_at timestamptz,
  last_retry_at timestamptz,
  locked_by text,
  locked_until timestamptz,
  lease_token uuid,
  redrive_generation integer NOT NULL DEFAULT 0,
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text,
  resolution text
);
CREATE INDEX IF NOT EXISTS hospital_due ON message_hospital (next_retry_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS hospital_tenant ON message_hospital (tenant_id, branch_id, status, first_failed_at);
CREATE INDEX IF NOT EXISTS hospital_leases ON message_hospital (locked_until) WHERE status = 'retrying';

CREATE TABLE IF NOT EXISTS message_hospital_attempt (
  id uuid PRIMARY KEY,
  hospital_id uuid NOT NULL REFERENCES message_hospital(id),
  generation integer NOT NULL,
  attempt_number integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  worker text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('running','succeeded','failed','interrupted')),
  error_code text,
  UNIQUE (hospital_id, generation, attempt_number)
);
CREATE TABLE IF NOT EXISTS integration_audit (
  id uuid PRIMARY KEY,
  hospital_id uuid NOT NULL REFERENCES message_hospital(id),
  tenant_id text NOT NULL,
  branch_id text NOT NULL,
  actor text NOT NULL,
  action text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
