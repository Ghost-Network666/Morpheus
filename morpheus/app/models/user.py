from sqlalchemy import String, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, timezone
from app.database import Base


class User(Base):
    """
    Morpheus is single-owner by default (see app/api/auth.py) — the first
    user created (the "owner") is always an admin. `is_admin` exists so
    admin-gated routes (backup/restore, destructive settings, etc.) have a
    real field to check now, and so a future multi-user mode can add
    non-admin accounts without changing those routes.
    """
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    chat_sessions = relationship("ChatSession", back_populates="user", cascade="all, delete-orphan")
    notes = relationship("Note", back_populates="user", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="user", cascade="all, delete-orphan")
    calendar_events = relationship("CalendarEvent", back_populates="user", cascade="all, delete-orphan")
    email_accounts = relationship("EmailAccount", back_populates="user", cascade="all, delete-orphan")
    ssh_profiles = relationship("SSHProfile", back_populates="user", cascade="all, delete-orphan")
    memory_vectors = relationship("MemoryVector", back_populates="user", cascade="all, delete-orphan")
    skills = relationship("Skill", back_populates="user", cascade="all, delete-orphan")
    vault_items = relationship("VaultItem", back_populates="user", cascade="all, delete-orphan")
    settings = relationship("UserSetting", back_populates="user", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="user", cascade="all, delete-orphan")
