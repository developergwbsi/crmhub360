-- Registro maestro de licencias / tenants de Crm Hub 360
CREATE TABLE IF NOT EXISTS tenants (
    id            SERIAL PRIMARY KEY,
    slug          TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    db_name       TEXT NOT NULL,
    web_port      INTEGER UNIQUE NOT NULL,
    ws_port       INTEGER UNIQUE NOT NULL,
    host          TEXT NOT NULL,
    plan          TEXT NOT NULL DEFAULT 'standard',
    max_users     INTEGER NOT NULL DEFAULT 10,
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','expired')),
    license_until DATE,
    espo_api_key  TEXT,
    hub_token     TEXT NOT NULL,
    settings      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_jobs (
    id         BIGSERIAL PRIMARY KEY,
    tenant     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    entity_id  TEXT,
    status     TEXT NOT NULL DEFAULT 'queued',
    error      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ai_jobs_tenant_idx ON ai_jobs (tenant, created_at DESC);
