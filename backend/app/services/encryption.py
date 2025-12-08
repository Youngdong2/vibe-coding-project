import base64
import os
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from app.config import get_settings


def _get_fernet() -> Fernet:
    """Fernet 인스턴스 생성"""
    settings = get_settings()
    key = settings.encryption_key.encode()

    # 32바이트 키를 Fernet 호환 키로 변환
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"meeting-minutes-salt",
        iterations=100000,
    )
    fernet_key = base64.urlsafe_b64encode(kdf.derive(key))
    return Fernet(fernet_key)


def encrypt_value(value: str) -> str:
    """값을 암호화"""
    fernet = _get_fernet()
    encrypted = fernet.encrypt(value.encode())
    return base64.urlsafe_b64encode(encrypted).decode()


def decrypt_value(encrypted_value: str) -> str:
    """암호화된 값을 복호화"""
    fernet = _get_fernet()
    decoded = base64.urlsafe_b64decode(encrypted_value.encode())
    decrypted = fernet.decrypt(decoded)
    return decrypted.decode()
