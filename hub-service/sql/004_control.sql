-- Centro de control: cola de trabajos privilegiados, versiones de la «base de producción», auditoría y códigos de acceso de soporte
CREATE TABLE IF NOT EXISTS control_jobs (
    id          BIGSERIAL PRIMARY KEY,
    kind        TEXT NOT NULL,
    params      JSONB NOT NULL DEFAULT '{}'::jsonb,
    status      TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','error')),
    log         TEXT NOT NULL DEFAULT '',
    result      JSONB,
    created_by  TEXT NOT NULL DEFAULT 'control',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at  TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS control_jobs_status_idx ON control_jobs (status, id);

CREATE TABLE IF NOT EXISTS control_releases (
    id         TEXT PRIMARY KEY,
    note       TEXT NOT NULL DEFAULT '',
    commit_ref TEXT,
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS control_audit (
    id     BIGSERIAL PRIMARY KEY,
    at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor  TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT,
    detail JSONB
);
CREATE INDEX IF NOT EXISTS control_audit_at_idx ON control_audit (at DESC);

CREATE TABLE IF NOT EXISTS support_codes (
    code       TEXT PRIMARY KEY,
    slug       TEXT NOT NULL,
    user_name  TEXT NOT NULL,
    password   TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'client';   -- dev | prod | client
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS release_id TEXT;
UPDATE tenants SET kind = 'dev'  WHERE slug = 'dev'  AND kind = 'client';
UPDATE tenants SET kind = 'prod' WHERE slug = 'prod' AND kind = 'client';
