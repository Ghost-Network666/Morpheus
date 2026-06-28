import asyncio
import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

os.environ.setdefault("APP_HOST", "127.0.0.1")
os.environ.setdefault("APP_PORT", "7860")
os.environ.setdefault("AUTH_ENABLED", "false")
os.environ.setdefault("DATA_DIR", "data_test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing-only-32chars")


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def app():
    from app.main import create_app
    application = create_app()
    # Trigger startup
    async with application.router.lifespan_context(application):
        yield application


@pytest_asyncio.fixture
async def client(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture(autouse=True, scope="session")
def cleanup_test_db():
    yield
    import shutil
    shutil.rmtree("data_test", ignore_errors=True)
