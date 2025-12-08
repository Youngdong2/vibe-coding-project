from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.database import get_supabase_client

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


class MeetingCreate(BaseModel):
    title: str
    date: Optional[datetime] = None
    transcript: Optional[str] = None
    summary: Optional[str] = None


class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    transcript: Optional[str] = None
    summary: Optional[str] = None


class MeetingResponse(BaseModel):
    id: str
    user_id: str
    title: str
    date: datetime
    audio_url: Optional[str] = None
    transcript: Optional[str] = None
    summary: Optional[str] = None
    speaker_data: Optional[dict] = None
    created_at: datetime
    updated_at: datetime


def get_user_id_from_token(authorization: str) -> str:
    """토큰에서 사용자 ID 추출"""
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


@router.get("")
async def get_meetings(
    authorization: str = Header(None),
    limit: int = 20,
    offset: int = 0
):
    """회의록 목록 조회"""
    user_id = get_user_id_from_token(authorization)
    supabase = get_supabase_client()

    try:
        response = supabase.table("meetings") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("date", desc=True) \
            .range(offset, offset + limit - 1) \
            .execute()

        return {
            "meetings": response.data,
            "count": len(response.data)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{meeting_id}")
async def get_meeting(
    meeting_id: str,
    authorization: str = Header(None)
):
    """회의록 상세 조회"""
    user_id = get_user_id_from_token(authorization)
    supabase = get_supabase_client()

    try:
        response = supabase.table("meetings") \
            .select("*") \
            .eq("id", meeting_id) \
            .eq("user_id", user_id) \
            .single() \
            .execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="회의록을 찾을 수 없습니다.")

        return response.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=MeetingResponse)
async def create_meeting(
    meeting: MeetingCreate,
    authorization: str = Header(None)
):
    """새 회의록 생성"""
    user_id = get_user_id_from_token(authorization)
    supabase = get_supabase_client()

    try:
        data = {
            "user_id": user_id,
            "title": meeting.title,
            "date": meeting.date.isoformat() if meeting.date else datetime.now().isoformat(),
            "transcript": meeting.transcript,
            "summary": meeting.summary,
        }

        response = supabase.table("meetings").insert(data).execute()

        if not response.data:
            raise HTTPException(status_code=500, detail="회의록 생성에 실패했습니다.")

        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{meeting_id}")
async def update_meeting(
    meeting_id: str,
    meeting: MeetingUpdate,
    authorization: str = Header(None)
):
    """회의록 수정"""
    user_id = get_user_id_from_token(authorization)
    supabase = get_supabase_client()

    try:
        # 먼저 해당 회의록이 사용자 소유인지 확인
        existing = supabase.table("meetings") \
            .select("id") \
            .eq("id", meeting_id) \
            .eq("user_id", user_id) \
            .single() \
            .execute()

        if not existing.data:
            raise HTTPException(status_code=404, detail="회의록을 찾을 수 없습니다.")

        # 업데이트할 필드만 포함
        update_data = {}
        if meeting.title is not None:
            update_data["title"] = meeting.title
        if meeting.transcript is not None:
            update_data["transcript"] = meeting.transcript
        if meeting.summary is not None:
            update_data["summary"] = meeting.summary

        if not update_data:
            raise HTTPException(status_code=400, detail="수정할 내용이 없습니다.")

        response = supabase.table("meetings") \
            .update(update_data) \
            .eq("id", meeting_id) \
            .eq("user_id", user_id) \
            .execute()

        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{meeting_id}")
async def delete_meeting(
    meeting_id: str,
    authorization: str = Header(None)
):
    """회의록 삭제"""
    user_id = get_user_id_from_token(authorization)
    supabase = get_supabase_client()

    try:
        # 먼저 해당 회의록이 사용자 소유인지 확인
        existing = supabase.table("meetings") \
            .select("id") \
            .eq("id", meeting_id) \
            .eq("user_id", user_id) \
            .single() \
            .execute()

        if not existing.data:
            raise HTTPException(status_code=404, detail="회의록을 찾을 수 없습니다.")

        supabase.table("meetings") \
            .delete() \
            .eq("id", meeting_id) \
            .eq("user_id", user_id) \
            .execute()

        return {"message": "회의록이 삭제되었습니다."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
