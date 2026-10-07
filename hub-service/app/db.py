from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from . import config

pool = ConnectionPool(config.DATABASE_URL, min_size=1, max_size=5, kwargs={"row_factory": dict_row}, open=False)


def get_tenant(slug: str) -> dict | None:
    with pool.connection() as c:
        return c.execute("SELECT * FROM tenants WHERE slug = %s", (slug,)).fetchone()


def log_job(tenant: str, kind: str, entity_id: str | None) -> int:
    with pool.connection() as c:
        return c.execute(
            "INSERT INTO ai_jobs (tenant, kind, entity_id) VALUES (%s,%s,%s) RETURNING id",
            (tenant, kind, entity_id),
        ).fetchone()["id"]


def finish_job(job_id: int, error: str | None = None) -> None:
    with pool.connection() as c:
        c.execute(
            "UPDATE ai_jobs SET status = %s, error = %s, finished_at = now() WHERE id = %s",
            ("error" if error else "done", error, job_id),
        )
