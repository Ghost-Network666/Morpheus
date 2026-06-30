from sqlalchemy import String, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from app.database import Base


class ObsidianNote(Base):
    __tablename__ = "obsidian_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    rel_path: Mapped[str] = mapped_column(String(1024), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(512))
    tags: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    modified_at: Mapped[datetime] = mapped_column(DateTime)
    indexed_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
