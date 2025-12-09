"""
AI 요약 생성 API
"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from openai import OpenAI
from datetime import datetime

from app.database import get_supabase_client, get_supabase_admin_client
from app.services.encryption import decrypt_value

router = APIRouter(prefix="/api/summary", tags=["summary"])


def get_user_id_from_token(authorization: str) -> str:
    """토큰에서 사용자 ID 추출"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증이 필요합니다")

    token = authorization.replace("Bearer ", "")
    supabase = get_supabase_client()

    try:
        user_response = supabase.auth.get_user(token)
        if not user_response.user:
            raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다")
        return user_response.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="인증에 실패했습니다")


class SummaryRequest(BaseModel):
    meeting_id: str
    regenerate: bool = False  # True면 기존 요약 무시하고 재생성


class SummaryResponse(BaseModel):
    summary: str
    meeting_id: str
    generated_at: str


SUMMARY_SYSTEM_PROMPT = """당신은 회의 내용을 요약하는 전문가입니다.
회의 전사(transcript)를 분석하여 다음 형식으로 요약해주세요:

## 📋 회의 요약

### 주요 논의 사항
- 핵심 주제와 논의된 내용을 3~5개의 bullet point로 정리

### 결정 사항
- 회의에서 결정된 사항들 (없으면 "결정된 사항 없음")

### 액션 아이템
- 후속 조치가 필요한 항목들 (담당자가 언급되었다면 포함)

### 기타 메모
- 중요하지만 위 카테고리에 해당하지 않는 내용

요약은 간결하고 명확하게 작성하되, 중요한 세부사항은 누락하지 마세요.
화자 정보가 있다면 누가 어떤 의견을 냈는지도 포함해주세요.
"""


@router.post("/generate", response_model=SummaryResponse)
async def generate_summary(
    request: SummaryRequest,
    authorization: str = Header(None)
):
    """회의 내용을 AI로 요약 생성"""
    user_id = get_user_id_from_token(authorization)
    meeting_id = request.meeting_id

    supabase = get_supabase_admin_client()

    # 1. 회의록 조회
    meeting_result = supabase.table("meetings").select("*").eq("id", meeting_id).eq("user_id", user_id).execute()

    if not meeting_result.data:
        raise HTTPException(status_code=404, detail="회의록을 찾을 수 없습니다")

    meeting = meeting_result.data[0]
    transcript = meeting.get("transcript", "")
    existing_summary = meeting.get("summary", "")

    # 2. 이미 요약이 있고 재생성이 아니면 기존 요약 반환
    if existing_summary and not request.regenerate:
        return SummaryResponse(
            summary=existing_summary,
            meeting_id=meeting_id,
            generated_at=meeting.get("updated_at", datetime.utcnow().isoformat())
        )

    # 3. transcript가 없으면 에러
    if not transcript or len(transcript.strip()) < 10:
        raise HTTPException(status_code=400, detail="요약할 회의 내용이 없습니다. 먼저 녹음을 진행해주세요.")

    # 4. 사용자의 OpenAI API 키 가져오기
    settings_result = supabase.table("settings").select("openai_api_key").eq("user_id", user_id).execute()

    if not settings_result.data or not settings_result.data[0].get("openai_api_key"):
        raise HTTPException(status_code=400, detail="OpenAI API 키가 설정되지 않았습니다. 설정 페이지에서 API 키를 등록해주세요.")

    encrypted_key = settings_result.data[0]["openai_api_key"]
    api_key = decrypt_value(encrypted_key)

    # 5. OpenAI API로 요약 생성
    try:
        client = OpenAI(api_key=api_key)

        # 회의 제목도 컨텍스트로 제공
        user_prompt = f"회의 제목: {meeting.get('title', '제목 없음')}\n\n회의 전사 내용:\n{transcript}"

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=2000
        )

        summary = response.choices[0].message.content

    except Exception as e:
        print(f"[Summary] OpenAI API 에러: {e}")
        raise HTTPException(status_code=500, detail=f"요약 생성 중 오류가 발생했습니다: {str(e)}")

    # 6. 요약 저장
    try:
        supabase.table("meetings").update({
            "summary": summary,
            "updated_at": datetime.utcnow().isoformat()
        }).eq("id", meeting_id).eq("user_id", user_id).execute()

    except Exception as e:
        print(f"[Summary] DB 저장 에러: {e}")
        # 저장 실패해도 요약은 반환

    return SummaryResponse(
        summary=summary,
        meeting_id=meeting_id,
        generated_at=datetime.utcnow().isoformat()
    )


@router.get("/{meeting_id}", response_model=SummaryResponse)
async def get_summary(
    meeting_id: str,
    authorization: str = Header(None)
):
    """회의 요약 조회"""
    user_id = get_user_id_from_token(authorization)

    supabase = get_supabase_admin_client()

    meeting_result = supabase.table("meetings").select("summary, updated_at").eq("id", meeting_id).eq("user_id", user_id).execute()

    if not meeting_result.data:
        raise HTTPException(status_code=404, detail="회의록을 찾을 수 없습니다")

    meeting = meeting_result.data[0]
    summary = meeting.get("summary", "")

    if not summary:
        raise HTTPException(status_code=404, detail="요약이 아직 생성되지 않았습니다")

    return SummaryResponse(
        summary=summary,
        meeting_id=meeting_id,
        generated_at=meeting.get("updated_at", "")
    )
