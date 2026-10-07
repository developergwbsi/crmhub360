-- Web Push: suscripciones por dispositivo y claves VAPID del servicio
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         BIGSERIAL PRIMARY KEY,
    tenant     TEXT NOT NULL REFERENCES tenants(slug) ON DELETE CASCADE,
    user_id    TEXT NOT NULL,
    endpoint   TEXT UNIQUE NOT NULL,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_ok    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS push_subs_tenant_idx ON push_subscriptions (tenant, user_id);
