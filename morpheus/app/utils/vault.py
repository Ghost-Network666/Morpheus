import base64
import os
import secrets
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from app.config import settings

_SALT = b"morpheus-vault-salt-v1"
_KEY_FILE = ".vault_key"


def _load_or_create_key() -> str:
    """Return a stable Fernet key, auto-generating one on first run."""
    key_path = os.path.join(settings.data_dir, _KEY_FILE)
    if os.path.exists(key_path):
        return open(key_path).read().strip()
    os.makedirs(settings.data_dir, exist_ok=True)
    key = Fernet.generate_key().decode()
    with open(key_path, "w") as f:
        f.write(key)
    return key


def _get_fernet() -> Fernet:
    raw = settings.vault_key or _load_or_create_key()
    key_bytes = raw.encode() if isinstance(raw, str) else raw
    # Re-derive if not already a valid 44-byte Fernet key
    if len(key_bytes) != 44:
        kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=_SALT, iterations=100_000)
        key_bytes = base64.urlsafe_b64encode(kdf.derive(key_bytes))
    return Fernet(key_bytes)


def encrypt(value: str) -> str:
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    return _get_fernet().decrypt(token.encode()).decode()
