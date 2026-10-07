-- Campañas de mensajes masivos
CREATE TABLE IF NOT EXISTS broadcasts (
    id           BIGSERIAL PRIMARY KEY,
    tenant       TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    channel      TEXT NOT NULL CHECK (channel IN ('whatsapp','sms','telegram')),
    text         TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('scheduled','running','paused','done','cancelled')),
    per_minute   INTEGER NOT NULL DEFAULT 20,
    scheduled_at TIMESTAMPTZ,
    next_send_at TIMESTAMPTZ,
    created_by   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS broadcasts_tenant_idx ON broadcasts (tenant, created_at DESC);
CREATE TABLE IF NOT EXISTS broadcast_items (
    id           BIGSERIAL PRIMARY KEY,
    broadcast_id BIGINT NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
    lead_id      TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
    error        TEXT,
    sent_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS broadcast_items_idx ON broadcast_items (broadcast_id, status);
