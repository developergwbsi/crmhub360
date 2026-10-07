-- Ajustes del Centro de control: cuenta del superadmin, correo general, proveedores aliados y asignaciones por empresa
CREATE TABLE IF NOT EXISTS control_settings (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Enlaces de recuperación de contraseña del Centro (se guarda solo el hash del token)
CREATE TABLE IF NOT EXISTS control_resets (
    token_hash TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);
