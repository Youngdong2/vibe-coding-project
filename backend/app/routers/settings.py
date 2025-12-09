from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
from app.database import get_supabase_client, get_supabase_admin_client
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

    # 암호화하여 저장 (admin client로 RLS 우회)
    encrypted_key = encrypt_value(request.api_key)
    supabase = get_supabase_admin_client()

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

    # 암호화하여 저장 (admin client로 RLS 우회)
    encrypted_token = encrypt_value(request.api_token)
    supabase = get_supabase_admin_client()

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


class CleanupRequest(BaseModel):
    days: int = 90


@router.post("/cleanup-old-audio")
async def cleanup_old_audio(request: CleanupRequest, authorization: str = Header(None)):
    """오래된 음성 파일 정리 (기본 90일)"""
    user_id = await get_current_user_id(authorization)
    supabase = get_supabase_admin_client()

    # 삭제 기준일 계산
    cutoff_date = (datetime.now() - timedelta(days=request.days)).isoformat()

    try:
        # 오래된 회의록 중 audio_url이 있는 것들 조회
        meetings_response = supabase.table("meetings") \
            .select("id, audio_url, date") \
            .eq("user_id", user_id) \
            .lt("date", cutoff_date) \
            .not_.is_("audio_url", "null") \
            .execute()

        old_meetings = meetings_response.data
        deleted_count = 0

        for meeting in old_meetings:
            audio_url = meeting.get("audio_url")
            if audio_url:
                # Storage에서 파일 삭제
                # URL 형식: https://xxx.supabase.co/storage/v1/object/public/audio-files/user_id/filename
                try:
                    # URL에서 파일 경로 추출
                    if "/audio-files/" in audio_url:
                        file_path = audio_url.split("/audio-files/")[1]
                        supabase.storage.from_("audio-files").remove([file_path])

                        # 회의록의 audio_url을 null로 업데이트
                        supabase.table("meetings") \
                            .update({"audio_url": None}) \
                            .eq("id", meeting["id"]) \
                            .execute()

                        deleted_count += 1
                except Exception as e:
                    print(f"[Cleanup] 파일 삭제 실패: {meeting['id']} - {e}")
                    continue

        return {
            "message": f"{request.days}일 이상 된 음성 파일 {deleted_count}개가 삭제되었습니다.",
            "deleted_count": deleted_count,
            "total_found": len(old_meetings)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"정리에 실패했습니다: {str(e)}")


@router.get("/audio-stats")
async def get_audio_stats(authorization: str = Header(None)):
    """음성 파일 통계 조회"""
    user_id = await get_current_user_id(authorization)
    supabase = get_supabase_client()

    try:
        # 전체 음성 파일이 있는 회의록 수
        total_response = supabase.table("meetings") \
            .select("id", count="exact") \
            .eq("user_id", user_id) \
            .not_.is_("audio_url", "null") \
            .execute()

        total_count = total_response.count if total_response.count else 0

        # 90일 이상 된 음성 파일 수
        cutoff_date = (datetime.now() - timedelta(days=90)).isoformat()
        old_response = supabase.table("meetings") \
            .select("id", count="exact") \
            .eq("user_id", user_id) \
            .lt("date", cutoff_date) \
            .not_.is_("audio_url", "null") \
            .execute()

        old_count = old_response.count if old_response.count else 0

        return {
            "total_audio_files": total_count,
            "old_audio_files": old_count,
            "cutoff_days": 90
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"통계 조회에 실패했습니다: {str(e)}")
