"""
Confluence 연동 API
"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
import httpx
import base64

from app.database import get_supabase_client, get_supabase_admin_client
from app.services.encryption import decrypt_value

router = APIRouter(prefix="/api/confluence", tags=["confluence"])


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


class UploadRequest(BaseModel):
    meeting_id: str


class UploadResponse(BaseModel):
    success: bool
    page_url: str
    page_id: str
    message: str


async def get_space_id_from_key(client: httpx.AsyncClient, site_url: str, auth_header: str, space_key: str) -> str:
    """Space Key로 Space ID(숫자) 조회"""
    response = await client.get(
        f"{site_url.rstrip('/')}/wiki/api/v2/spaces",
        params={"keys": space_key},
        headers={
            "Authorization": f"Basic {auth_header}",
            "Accept": "application/json"
        },
        timeout=10.0
    )

    if response.status_code != 200:
        raise HTTPException(
            status_code=400,
            detail=f"Space '{space_key}'를 찾을 수 없습니다. Space Key를 확인해주세요."
        )

    data = response.json()
    results = data.get("results", [])

    if not results:
        raise HTTPException(
            status_code=400,
            detail=f"Space '{space_key}'를 찾을 수 없습니다. Space Key를 확인해주세요."
        )

    return str(results[0]["id"])


def markdown_to_confluence_storage(markdown: str) -> str:
    """마크다운을 Confluence Storage Format으로 변환 (간단 버전)"""
    lines = markdown.split('\n')
    result = []

    for line in lines:
        # 헤더 변환
        if line.startswith('### '):
            result.append(f'<h3>{line[4:]}</h3>')
        elif line.startswith('## '):
            result.append(f'<h2>{line[3:]}</h2>')
        elif line.startswith('# '):
            result.append(f'<h1>{line[2:]}</h1>')
        # 불릿 포인트
        elif line.startswith('- '):
            result.append(f'<li>{line[2:]}</li>')
        # 빈 줄
        elif line.strip() == '':
            result.append('<br/>')
        else:
            result.append(f'<p>{line}</p>')

    # li 태그들을 ul로 감싸기
    html = '\n'.join(result)
    # 연속된 li 태그들을 ul로 감싸기 (간단 처리)
    import re
    html = re.sub(r'(<li>.*?</li>\n?)+', lambda m: f'<ul>{m.group(0)}</ul>', html)

    return html


@router.post("/upload", response_model=UploadResponse)
async def upload_to_confluence(
    request: UploadRequest,
    authorization: str = Header(None)
):
    """회의록을 Confluence 페이지로 업로드"""
    user_id = get_user_id_from_token(authorization)
    meeting_id = request.meeting_id

    supabase = get_supabase_admin_client()

    # 1. 회의록 조회
    meeting_result = supabase.table("meetings").select("*").eq("id", meeting_id).eq("user_id", user_id).execute()

    if not meeting_result.data:
        raise HTTPException(status_code=404, detail="회의록을 찾을 수 없습니다")

    meeting = meeting_result.data[0]
    title = meeting.get("title", "회의록")
    summary = meeting.get("summary", "")
    transcript = meeting.get("transcript", "")

    if not summary and not transcript:
        raise HTTPException(status_code=400, detail="업로드할 내용이 없습니다. 요약 또는 전문이 필요합니다.")

    # 2. Confluence 설정 조회
    settings_result = supabase.table("settings").select(
        "confluence_api_token, confluence_site_url, confluence_space_key, confluence_parent_page_id"
    ).eq("user_id", user_id).execute()

    if not settings_result.data:
        raise HTTPException(status_code=400, detail="Confluence 설정이 없습니다. 설정 페이지에서 Confluence 연동을 설정해주세요.")

    settings = settings_result.data[0]
    encrypted_token = settings.get("confluence_api_token")
    site_url = settings.get("confluence_site_url")
    space_key = settings.get("confluence_space_key")
    parent_page_id = settings.get("confluence_parent_page_id")

    if not encrypted_token or not site_url or not space_key:
        raise HTTPException(status_code=400, detail="Confluence 설정이 완료되지 않았습니다. 설정 페이지에서 모든 정보를 입력해주세요.")

    api_token = decrypt_value(encrypted_token)

    # 3. 페이지 내용 구성
    content_parts = []

    # 회의 날짜
    meeting_date = meeting.get("date", "")
    if meeting_date:
        content_parts.append(f"<p><strong>회의 일시:</strong> {meeting_date}</p>")

    # 요약
    if summary:
        content_parts.append("<h2>요약</h2>")
        content_parts.append(markdown_to_confluence_storage(summary))

    # 전문
    if transcript:
        content_parts.append("<h2>전문</h2>")
        # 전문은 접기(expand) 매크로로 감싸기
        content_parts.append(
            f'<ac:structured-macro ac:name="expand">'
            f'<ac:parameter ac:name="title">회의 전문 보기</ac:parameter>'
            f'<ac:rich-text-body><p>{transcript.replace(chr(10), "<br/>")}</p></ac:rich-text-body>'
            f'</ac:structured-macro>'
        )

    page_content = "\n".join(content_parts)

    # 4. Confluence API 호출
    # site_url 형식: https://yoursite.atlassian.net
    api_url = f"{site_url.rstrip('/')}/wiki/api/v2/pages"

    try:
        async with httpx.AsyncClient() as client:
            # Basic Auth: email:api_token
            # 사용자가 api_token에 "email:token" 형식으로 입력
            auth_header = base64.b64encode(api_token.encode()).decode()

            # Space Key로 Space ID 조회
            space_id = await get_space_id_from_key(client, site_url, auth_header, space_key)

            # 페이지 생성 payload
            payload = {
                "spaceId": space_id,
                "status": "current",
                "title": f"[회의록] {title}",
                "body": {
                    "representation": "storage",
                    "value": page_content
                }
            }

            # parent page가 있으면 추가
            if parent_page_id:
                payload["parentId"] = parent_page_id

            response = await client.post(
                api_url,
                json=payload,
                headers={
                    "Authorization": f"Basic {auth_header}",
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                timeout=30.0
            )

            if response.status_code in (200, 201):
                result = response.json()
                page_id = result.get("id")
                # 페이지 URL 구성
                page_url = f"{site_url.rstrip('/')}/wiki/spaces/{space_key}/pages/{page_id}"

                return UploadResponse(
                    success=True,
                    page_url=page_url,
                    page_id=page_id,
                    message="Confluence 페이지가 생성되었습니다!"
                )
            else:
                error_detail = response.text
                print(f"[Confluence] API 에러: {response.status_code} - {error_detail}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Confluence 업로드 실패: {error_detail}"
                )

    except httpx.RequestError as e:
        print(f"[Confluence] 연결 에러: {e}")
        raise HTTPException(status_code=500, detail=f"Confluence 연결 실패: {str(e)}")


@router.get("/test-connection")
async def test_confluence_connection(authorization: str = Header(None)):
    """Confluence 연결 테스트"""
    user_id = get_user_id_from_token(authorization)
    supabase = get_supabase_admin_client()

    # 설정 조회
    settings_result = supabase.table("settings").select(
        "confluence_api_token, confluence_site_url"
    ).eq("user_id", user_id).execute()

    if not settings_result.data:
        raise HTTPException(status_code=400, detail="Confluence 설정이 없습니다.")

    settings = settings_result.data[0]
    encrypted_token = settings.get("confluence_api_token")
    site_url = settings.get("confluence_site_url")

    if not encrypted_token or not site_url:
        raise HTTPException(status_code=400, detail="Confluence 설정이 완료되지 않았습니다.")

    api_token = decrypt_value(encrypted_token)

    try:
        async with httpx.AsyncClient() as client:
            auth_header = base64.b64encode(api_token.encode()).decode()

            # 사용자 정보 조회로 연결 테스트
            response = await client.get(
                f"{site_url.rstrip('/')}/wiki/api/v2/spaces",
                headers={
                    "Authorization": f"Basic {auth_header}",
                    "Accept": "application/json"
                },
                timeout=10.0
            )

            if response.status_code == 200:
                return {"success": True, "message": "Confluence 연결 성공!"}
            else:
                return {"success": False, "message": f"연결 실패: {response.status_code}"}

    except httpx.RequestError as e:
        return {"success": False, "message": f"연결 오류: {str(e)}"}
