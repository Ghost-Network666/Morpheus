import logging
import os

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

logger = logging.getLogger(__name__)


if not settings.is_postgres:
    os.makedirs(settings.data_dir, exist_ok=True)

# SQLite needs check_same_thread=False; PostgreSQL does not accept that arg
_connect_args = {} if settings.is_postgres else {"check_same_thread": False}

engine = create_async_engine(
    settings.database_url,
    echo=settings.app_debug,
    connect_args=_connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def _table_columns(sync_conn, table_name: str) -> set[str]:
    return {col["name"] for col in inspect(sync_conn).get_columns(table_name)}


def _add_column_if_missing(sync_conn, table_name: str, column_name: str, ddl_type: str, default_sql: str) -> None:
    """
    Adds a column to an already-existing table if it isn't there yet.

    This project has no migration framework (no Alembic) — `create_all` only
    creates missing *tables*, so a fresh install already gets new columns for
    free via the model definition, but an existing on-disk database needs an
    explicit `ALTER TABLE` or it's stuck on the old schema forever. This is
    intentionally minimal (one column at a time, sqlite/postgres only, the
    only two backends this app supports) rather than a full migration
    framework, which would be disproportionate for a single-owner app.
    """
    if column_name in _table_columns(sync_conn, table_name):
        return
    logger.info("Migrating schema: adding %s.%s", table_name, column_name)
    sync_conn.execute(text(
        f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl_type} NOT NULL DEFAULT {default_sql}"
    ))


def _run_migrations(sync_conn) -> None:
    _add_column_if_missing(sync_conn, "users", "is_admin", "BOOLEAN", "1")


async def init_db():
    async with engine.begin() as conn:
        from app.models import all_models  # noqa: ensure models are imported
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_run_migrations)
