"""Acceso a la base de datos Postgres compartida del hub (pool de psycopg con filas como dict).
Tablas que toca aquí: tenants (empresas y su configuración) y ai_jobs (registro de trabajos de IA)."""
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from . import config

pool = ConnectionPool(config.DATABASE_URL, min_size=1, max_size=5, kwargs={"row_factory": dict_row}, open=False)


def get_tenant(slug: str) -> dict | None:
    """Fila de la empresa (tenant) por su slug, o None si no existe."""
    with pool.connection() as c:
        return c.execute("SELECT * FROM tenants WHERE slug = %s", (slug,)).fetchone()


def log_job(tenant: str, kind: str, entity_id: str | None) -> int:
    """Registra un trabajo de IA en ai_jobs y devuelve su id."""
    with pool.connection() as c:
        return c.execute(
            "INSERT INTO ai_jobs (tenant, kind, entity_id) VALUES (%s,%s,%s) RETURNING id",
            (tenant, kind, entity_id),
        ).fetchone()["id"]


def finish_job(job_id: int, error: str | None = None) -> None:
    """Cierra el trabajo en ai_jobs: estado «done», o «error» con el mensaje si se indica."""
    with pool.connection() as c:
        c.execute(
            "UPDATE ai_jobs SET status = %s, error = %s, finished_at = now() WHERE id = %s",
            ("error" if error else "done", error, job_id),
        )
