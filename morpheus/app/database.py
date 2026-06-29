from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings
import os


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


async def init_db():
    async with engine.begin() as conn:
        from app.models import all_models  # noqa: ensure models are imported
        await conn.run_sync(Base.metadata.create_all)
