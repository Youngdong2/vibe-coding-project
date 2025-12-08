from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from app.database import get_supabase_client
from app.services.encryption import encrypt_value, decrypt_value
import httpx

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsResponse(BaseModel):
    has_openai_key: bool
    has_confluence_token: bool
    confluence_site_url: Optional[str] = None
    confluence_space_key: Optional[str] = None
    confluence_parent_page_id: Optional[str] = None


class OpenAIKeyRequest(BaseModel):
    api_key: str


class ConfluenceSettingsRequest(BaseModel):
    api_token: str
    site_url: str
    space_key: str
    parent_page_id: Optional[str] = None


async def get_current_user_id(authorization: str = Header(None)) -> str:
    """현재 사용자 ID 추출"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")

    token = authorization.replace("Bearer ", "")
    supabase = get_supabase_client()

    try:
        response = supabase.auth.get_user(token)
        if response.user is None:
            raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")
        return str(response.user.id)
    except Exception:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")


@router.get("", response_model=SettingsResponse)
async def get_settings(authorization: str = Header(None)):
    """설정 조회"""
    user_id = await get_current_user_id(authorization)
    supabase = get_supabase_client()

    try:
        response = supabase.table("settings").select("*").eq("user_id", user_id).single().execute()
        data = response.data

        if data is None:
            return SettingsResponse(
                has_openai_key=False,
                has_confluence_token=False
            )

        return SettingsResponse(
            has_openai_key=bool(data.get("openai_api_key")),
            has_confluence_token=bool(data.get("confluence_api_token")),
            confluence_site_url=data.get("confluence_site_url"),
            confluence_space_key=data.get("confluence_space_key"),
            confluence_parent_page_id=data.get("confluence_parent_page_id")
        )
    except Exception:
        return SettingsResponse(
            has_openai_key=False,
            has_confluence_token=False
        )


@router.post("/openai-key")
async def save_openai_key(request: OpenAIKeyRequest, authorization: str = Header(None)):
    """OpenAI API Key 저장"""
    user_id = await get_current_user_id(authorization)

    # API Key 유효성 검증
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {request.api_key}"},
                timeout=10.0
            )
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="유효하지 않은 OpenAI API Key입니다.")
    except httpx.RequestError:
        raise HTTPException(status_code=400, detail="OpenAI API 연결에 실패했습니다.")

    # 암호화하여 저장
    encrypted_key = encrypt_value(request.api_key)
    supabase = get_supabase_client()

    try:
        # upsert (있으면 업데이트, 없으면 삽입)
        supabase.table("settings").upsert({
            "user_id": user_id,
            "openai_api_key": encrypted_key
        }, on_conflict="user_id").execute()

        return {"message": "OpenAI API Key가 저장되었습니다."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"저장에 실패했습니다: {str(e)}")


@router.post("/validate-openai-key")
async def validate_openai_key(request: OpenAIKeyRequest):
    """OpenAI API Key 유효성 검증 (저장하지 않음)"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {request.api_key}"},
                timeout=10.0
            )
            if response.status_code == 200:
                return {"valid": True, "message": "유효한 API Key입니다."}
            else:
                return {"valid": False, "message": "유효하지 않은 API Key입니다."}
    except httpx.RequestError:
        raise HTTPException(status_code=400, detail="OpenAI API 연결에 실패했습니다.")


@router.post("/confluence")
async def save_confluence_settings(request: ConfluenceSettingsRequest, authorization: str = Header(None)):
    """Confluence 설정 저장"""
    user_id = await get_current_user_id(authorization)

    # 암호화하여 저장
    encrypted_token = encrypt_value(request.api_token)
    supabase = get_supabase_client()

    try:
        supabase.table("settings").upsert({
            "user_id": user_id,
            "confluence_api_token": encrypted_token,
            "confluence_site_url": request.site_url,
            "confluence_space_key": request.space_key,
            "confluence_parent_page_id": request.parent_page_id
        }, on_conflict="user_id").execute()

        return {"message": "Confluence 설정이 저장되었습니다."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"저장에 실패했습니다: {str(e)}")


@router.delete("/openai-key")
async def delete_openai_key(authorization: str = Header(None)):
    """OpenAI API Key 삭제"""
    user_id = await get_current_user_id(authorization)
    supabase = get_supabase_client()

    try:
        supabase.table("settings").update({
            "openai_api_key": None
        }).eq("user_id", user_id).execute()

        return {"message": "OpenAI API Key가 삭제되었습니다."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"삭제에 실패했습니다: {str(e)}")
