import json
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.email import EmailAccount, EmailMessage
from app.models.user import User
from app.api.auth import require_user
from app.utils.vault import encrypt, decrypt
from app.core.chat_engine import stream_chat
from app.config import settings

router = APIRouter(prefix="/api/email", tags=["email"])


@router.get("/accounts")
async def list_accounts(db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(EmailAccount).where(EmailAccount.user_id == user.id))
    return [_account_out(a) for a in result.scalars().all()]


@router.post("/accounts")
async def add_account(request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    body = await request.json()
    account = EmailAccount(
        user_id=user.id,
        label=body.get("label", body["email"]),
        email=body["email"],
        imap_host=body["imap_host"],
        imap_port=body.get("imap_port", 993),
        imap_ssl=body.get("imap_ssl", True),
        smtp_host=body["smtp_host"],
        smtp_port=body.get("smtp_port", 587),
        smtp_tls=body.get("smtp_tls", True),
        username=body.get("username", body["email"]),
        password_encrypted=encrypt(body["password"]),
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return _account_out(account)


@router.delete("/accounts/{account_id}")
async def delete_account(account_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(EmailAccount).where(EmailAccount.id == account_id, EmailAccount.user_id == user.id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(404, "Account not found")
    await db.delete(account)
    await db.commit()
    return {"ok": True}


@router.post("/accounts/{account_id}/fetch")
async def fetch_messages(account_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(EmailAccount).where(EmailAccount.id == account_id, EmailAccount.user_id == user.id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(404, "Account not found")

    try:
        messages = await _fetch_imap(account)
        for msg_data in messages:
            existing = await db.execute(select(EmailMessage).where(EmailMessage.account_id == account_id, EmailMessage.uid == msg_data["uid"]))
            if existing.scalar_one_or_none():
                continue
            msg = EmailMessage(account_id=account_id, **msg_data)
            db.add(msg)
        await db.commit()
        return {"fetched": len(messages)}
    except Exception as e:
        raise HTTPException(500, f"IMAP error: {e}")


@router.get("/accounts/{account_id}/messages")
async def list_messages(account_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(EmailAccount).where(EmailAccount.id == account_id, EmailAccount.user_id == user.id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Account not found")

    result = await db.execute(select(EmailMessage).where(EmailMessage.account_id == account_id).order_by(EmailMessage.date.desc()).limit(100))
    return [_message_out(m) for m in result.scalars().all()]


@router.post("/accounts/{account_id}/reply")
async def generate_reply(account_id: int, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    body = await request.json()
    email_body = body.get("body", "")
    subject = body.get("subject", "")
    instruction = body.get("instruction", "Write a professional reply")

    prompt = f"Subject: {subject}\n\nEmail:\n{email_body}\n\nInstruction: {instruction}\n\nWrite the reply:"
    messages = [{"role": "user", "content": prompt}]

    async def generate():
        async for chunk in stream_chat(messages, settings.default_model, settings.default_provider):
            yield f"data: {json.dumps({'content': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/accounts/{account_id}/send")
async def send_email(account_id: int, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(EmailAccount).where(EmailAccount.id == account_id, EmailAccount.user_id == user.id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(404, "Account not found")

    body = await request.json()
    to_addr = body.get("to", "")
    subject = body.get("subject", "")
    message_body = body.get("body", "")
    if not to_addr or not subject:
        raise HTTPException(400, "to and subject are required")

    try:
        await _send_smtp(account, to_addr, subject, message_body)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, f"SMTP error: {e}")


@router.post("/accounts/{account_id}/triage")
async def triage_inbox(account_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(require_user)):
    result = await db.execute(select(EmailMessage).where(EmailMessage.account_id == account_id, EmailMessage.summary_ai.is_(None)).limit(10))
    messages = result.scalars().all()

    for msg in messages:
        if not msg.body:
            continue
        prompt = f"Summarize this email in 1-2 sentences and classify urgency (low/medium/high):\n\nSubject: {msg.subject or '(no subject)'}\n\n{msg.body[:2000]}"
        chat_messages = [{"role": "user", "content": prompt}]
        summary = ""
        async for chunk in stream_chat(chat_messages, settings.default_model, settings.default_provider):
            summary += chunk
        msg.summary_ai = summary

    await db.commit()
    return {"triaged": len(messages)}


async def _send_smtp(account: EmailAccount, to_addr: str, subject: str, body: str):
    import aiosmtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    password = decrypt(account.password_encrypted)
    msg = MIMEMultipart()
    msg["From"] = account.email
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain", "utf-8"))

    await aiosmtplib.send(
        msg,
        hostname=account.smtp_host,
        port=account.smtp_port,
        username=account.username,
        password=password,
        start_tls=account.smtp_tls,
    )


async def _fetch_imap(account: EmailAccount) -> list[dict]:
    import aioimaplib
    from datetime import datetime, timezone
    import email

    password = decrypt(account.password_encrypted)

    imap = aioimaplib.IMAP4_SSL(account.imap_host, account.imap_port) if account.imap_ssl else aioimaplib.IMAP4(account.imap_host, account.imap_port)
    await imap.wait_hello_from_server()
    await imap.login(account.username, password)
    await imap.select("INBOX")

    _, data = await imap.search("UNSEEN")
    uids = data[0].split()[:20] if data else []

    messages = []
    for uid in uids:
        _, msg_data = await imap.fetch(uid.decode(), "(RFC822)")
        if msg_data:
            raw = msg_data[1]
            msg = email.message_from_bytes(raw)
            subject = _decode_header(msg.get("Subject", ""))
            from_addr = _decode_header(msg.get("From", ""))
            to_addr = msg.get("To", "")
            body = _extract_body(msg)
            messages.append({
                "uid": uid.decode(),
                "subject": subject,
                "from_addr": from_addr,
                "to_addr": to_addr,
                "body": body,
                "date": datetime.now(timezone.utc),
            })

    await imap.logout()
    return messages


def _decode_header(value: str) -> str:
    from email.header import decode_header as _dh
    parts = []
    for text, charset in _dh(value):
        if isinstance(text, bytes):
            parts.append(text.decode(charset or "utf-8", errors="replace"))
        else:
            parts.append(text)
    return "".join(parts)


def _extract_body(msg) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                return part.get_payload(decode=True).decode("utf-8", errors="replace")
    else:
        return msg.get_payload(decode=True).decode("utf-8", errors="replace") if msg.get_payload(decode=True) else ""
    return ""


def _account_out(a: EmailAccount):
    return {"id": a.id, "label": a.label, "email": a.email, "imap_host": a.imap_host, "smtp_host": a.smtp_host}


def _message_out(m: EmailMessage):
    return {"id": m.id, "uid": m.uid, "subject": m.subject, "from_addr": m.from_addr, "date": m.date, "summary_ai": m.summary_ai, "is_read": m.is_read, "is_starred": m.is_starred}
