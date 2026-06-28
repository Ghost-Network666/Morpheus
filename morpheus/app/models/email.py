from sqlalchemy import String, Integer, ForeignKey, DateTime, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, timezone
from app.database import Base


class EmailAccount(Base):
    __tablename__ = "email_accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    label: Mapped[str] = mapped_column(String(128))
    email: Mapped[str] = mapped_column(String(256))
    imap_host: Mapped[str] = mapped_column(String(256))
    imap_port: Mapped[int] = mapped_column(Integer, default=993)
    imap_ssl: Mapped[bool] = mapped_column(Boolean, default=True)
    smtp_host: Mapped[str] = mapped_column(String(256))
    smtp_port: Mapped[int] = mapped_column(Integer, default=587)
    smtp_tls: Mapped[bool] = mapped_column(Boolean, default=True)
    username: Mapped[str] = mapped_column(String(256))
    password_encrypted: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="email_accounts")
    messages = relationship("EmailMessage", back_populates="account", cascade="all, delete-orphan")


class EmailMessage(Base):
    __tablename__ = "email_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("email_accounts.id"), index=True)
    uid: Mapped[str] = mapped_column(String(128))
    subject: Mapped[str | None] = mapped_column(String(512), nullable=True)
    from_addr: Mapped[str | None] = mapped_column(String(256), nullable=True)
    to_addr: Mapped[str | None] = mapped_column(String(512), nullable=True)
    date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    html_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_ai: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    is_starred: Mapped[bool] = mapped_column(Boolean, default=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    account = relationship("EmailAccount", back_populates="messages")
