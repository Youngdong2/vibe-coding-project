from supabase import create_client, Client
from app.config import get_settings

settings = get_settings()

supabase: Client | None = None


def get_supabase_client() -> Client:
    global supabase
    if supabase is None:
        supabase = create_client(
            settings.supabase_url,
            settings.supabase_anon_key
        )
    return supabase


def get_supabase_admin_client() -> Client:
    """서비스 역할 키를 사용하는 관리자 클라이언트"""
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key
    )
