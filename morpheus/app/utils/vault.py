import base64
import os
import secrets
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from app.config import settings


def _get_fernet() -> Fernet:
    key = settings.vault_key
    if not key:
        # Derive from secret_key deterministically
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"morpheus-vault-salt",
            iterations=100000,
        )
        derived = kdf.derive(settings.secret_key.encode())
        key = base64.urlsafe_b64encode(derived).decode()

    # Ensure proper Fernet key format
    key_bytes = key.encode() if isinstance(key, str) else key
    if len(key_bytes) != 44:
        # Re-encode to proper length
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"morpheus-vault-salt",
            iterations=100000,
        )
        derived = kdf.derive(key_bytes)
        key_bytes = base64.urlsafe_b64encode(derived)

    return Fernet(key_bytes)


def encrypt(value: str) -> str:
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    return _get_fernet().decrypt(token.encode()).decode()
