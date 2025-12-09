from fastapi import APIRouter, HTTPException, Header, UploadFile, File, Form
from openai import OpenAI
from app.database import get_supabase_client, get_supabase_admin_client
from app.services.encryption import decrypt_value
import tempfile
import os
import uuid
import json
from datetime import datetime
from typing import Optional

router = APIRouter(prefix="/api/stt", tags=["stt"])


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


def get_openai_key(user_id: str) -> str:
    """사용자의 OpenAI API 키 조회 (복호화)"""
    supabase = get_supabase_admin_client()

    result = supabase.table("settings").select("openai_api_key").eq("user_id", user_id).execute()

    if not result.data or not result.data[0].get("openai_api_key"):
        raise HTTPException(
            status_code=400,
            detail="OpenAI API 키가 설정되지 않았습니다. 설정 페이지에서 API 키를 등록해주세요."
        )

    encrypted_key = result.data[0]["openai_api_key"]
    return decrypt_value(encrypted_key)


def parse_diarized_response(stream_response) -> dict:
    """
    스트리밍 응답에서 화자 분리 데이터 파싱
    """
    segments = []
    full_text_parts = []

    for event in stream_response:
        if hasattr(event, 'type'):
            if event.type == 'transcript.text.delta':
                # 텍스트 델타 수집
                if hasattr(event, 'delta'):
                    full_text_parts.append(event.delta)
            elif event.type == 'transcript.text.done':
                # 완료된 세그먼트 처리
                if hasattr(event, 'logprobs'):
                    pass  # logprobs는 diarize 모델에서 지원 안됨

        # 세그먼트 데이터 처리
        if hasattr(event, 'segment'):
            seg = event.segment
            segments.append({
                "speaker": getattr(seg, 'speaker', 'A'),
                "start": getattr(seg, 'start', 0),
                "end": getattr(seg, 'end', 0),
                "text": getattr(seg, 'text', '')
            })

    return {
        "segments": segments,
        "full_text": ''.join(full_text_parts)
    }


def build_speaker_data(segments: list) -> dict:
    """
    세그먼트 목록에서 speaker_data 구조 생성
    """
    speaker_dict = {}
    total_duration = 0

    for seg in segments:
        speaker_id = seg.get("speaker", "A")

        if speaker_id not in speaker_dict:
            speaker_dict[speaker_id] = {
                "id": speaker_id,
                "name": None,
                "segments": []
            }

        speaker_dict[speaker_id]["segments"].append({
            "start": seg.get("start", 0),
            "end": seg.get("end", 0),
            "text": seg.get("text", "")
        })

        end_time = seg.get("end", 0)
        if end_time > total_duration:
            total_duration = end_time

    return {
        "speakers": list(speaker_dict.values()),
        "total_duration": total_duration,
        "speaker_count": len(speaker_dict)
    }


def format_transcript_with_speakers(segments: list) -> str:
    """
    화자 라벨이 포함된 전사 텍스트 생성
    """
    lines = []
    for seg in sorted(segments, key=lambda x: x.get("start", 0)):
        speaker = seg.get("speaker", "A")
        text = seg.get("text", "").strip()
        if text:
            lines.append(f"[{speaker}] {text}")
    return "\n".join(lines)


@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    meeting_id: str = Form(None),
    use_diarization: bool = Form(True),
    authorization: str = Header(None)
):
    """
    음성 파일을 텍스트로 변환 (OpenAI gpt-4o-transcribe-diarize API 사용)
    화자 분리(Speaker Diarization) 지원
    """
    print(f"[STT] 요청 받음 - meeting_id: {meeting_id}, use_diarization: {use_diarization}")
    print(f"[STT] 오디오 파일: {audio.filename}, content_type: {audio.content_type}")

    user_id = get_user_id_from_token(authorization)
    openai_key = get_openai_key(user_id)
    print(f"[STT] user_id: {user_id}, API 키 존재: {bool(openai_key)}")

    # 파일 크기 검증 (25MB 제한)
    contents = await audio.read()
    print(f"[STT] 파일 크기: {len(contents)} bytes ({len(contents)/1024:.1f} KB)")
    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="파일 크기는 25MB를 초과할 수 없습니다")

    # 임시 파일로 저장
    suffix = ".webm" if "webm" in (audio.content_type or "") else ".mp3"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        tmp_file.write(contents)
        tmp_path = tmp_file.name

    try:
        client = OpenAI(api_key=openai_key)

        segments = []
        transcript_text = ""
        speaker_data = None
        total_duration = None

        with open(tmp_path, "rb") as audio_file:
            if use_diarization:
                # gpt-4o-transcribe-diarize 모델 사용
                try:
                    print("[STT] gpt-4o-transcribe-diarize 모델로 시도...")
                    # gpt-4o-transcribe-diarize는 diarized_json + chunking_strategy 필수
                    diarize_response = client.audio.transcriptions.create(
                        model="gpt-4o-transcribe-diarize",
                        file=audio_file,
                        language="ko",
                        response_format="diarized_json",
                        chunking_strategy="auto",
                    )

                    # 응답 처리
                    print(f"[STT] 응답 타입: {type(diarize_response)}")

                    # diarized_json 응답 구조 파싱
                    if hasattr(diarize_response, 'model_dump'):
                        response_dict = diarize_response.model_dump()
                    elif hasattr(diarize_response, 'to_dict'):
                        response_dict = diarize_response.to_dict()
                    else:
                        response_dict = vars(diarize_response) if hasattr(diarize_response, '__dict__') else {}

                    print(f"[STT] 응답 dict 키: {response_dict.keys() if response_dict else 'None'}")
                    print(f"[STT] 응답 내용: {str(response_dict)[:500]}")

                    # 텍스트 추출
                    transcript_text = response_dict.get('text', '') or getattr(diarize_response, 'text', '')

                    # segments 배열에서 화자 분리 데이터 추출
                    raw_segments = response_dict.get('segments', []) or getattr(diarize_response, 'segments', [])

                    if raw_segments:
                        for seg in raw_segments:
                            if isinstance(seg, dict):
                                seg_dict = seg
                            elif hasattr(seg, 'model_dump'):
                                seg_dict = seg.model_dump()
                            else:
                                seg_dict = vars(seg) if hasattr(seg, '__dict__') else {}

                            segments.append({
                                "speaker": seg_dict.get('speaker', 'A'),
                                "start": seg_dict.get('start', 0),
                                "end": seg_dict.get('end', 0),
                                "text": seg_dict.get('text', '')
                            })
                        print(f"[STT] 화자 분리 세그먼트 수: {len(segments)}")

                    # duration 추출
                    total_duration = response_dict.get('duration') or getattr(diarize_response, 'duration', None)

                    if segments:
                        # 화자 분리 데이터 구성
                        speaker_data = build_speaker_data(segments)
                        # transcript_text를 화자 라벨 포함 형식으로 재구성
                        transcript_text = format_transcript_with_speakers(segments)
                        if not total_duration:
                            total_duration = speaker_data.get("total_duration")
                    else:
                        print("[STT] 화자 분리 세그먼트 없음, 텍스트만 사용")

                except Exception as diarize_error:
                    print(f"[STT] Diarization 실패, whisper-1로 폴백: {diarize_error}")
                    import traceback
                    traceback.print_exc()
                    # diarization 실패 시 whisper-1로 폴백
                    audio_file.seek(0)
                    use_diarization = False

            if not use_diarization:
                # whisper-1 모델 사용 (폴백 또는 명시적 선택)
                transcript_response = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    language="ko",
                    response_format="verbose_json",
                )

                transcript_text = transcript_response.text
                total_duration = getattr(transcript_response, "duration", None)

                # whisper-1의 세그먼트 (화자 정보 없음)
                if hasattr(transcript_response, "segments") and transcript_response.segments:
                    for seg in transcript_response.segments:
                        # Pydantic 모델인 경우 model_dump() 사용
                        if hasattr(seg, 'model_dump'):
                            seg_dict = seg.model_dump()
                        elif isinstance(seg, dict):
                            seg_dict = seg
                        else:
                            seg_dict = {"start": 0, "end": 0, "text": str(seg)}

                        segments.append({
                            "speaker": None,
                            "start": seg_dict.get("start", 0),
                            "end": seg_dict.get("end", 0),
                            "text": seg_dict.get("text", "")
                        })

        # Supabase Storage에 음성 파일 업로드 (Admin 클라이언트 사용 - RLS 우회)
        audio_url = None
        if meeting_id:
            try:
                supabase_admin = get_supabase_admin_client()
                file_name = f"{user_id}/{meeting_id}/{uuid.uuid4()}{suffix}"

                # Storage 버킷에 업로드
                supabase_admin.storage.from_("audio-files").upload(
                    file_name,
                    contents,
                    {"content-type": audio.content_type or "audio/webm"}
                )

                # Public URL 생성
                audio_url = supabase_admin.storage.from_("audio-files").get_public_url(file_name)

                # 회의록 업데이트 (speaker_data 포함)
                update_data = {
                    "audio_url": audio_url,
                    "transcript": transcript_text,
                    "updated_at": datetime.utcnow().isoformat()
                }

                if speaker_data:
                    update_data["speaker_data"] = speaker_data

                supabase_admin.table("meetings").update(update_data).eq("id", meeting_id).eq("user_id", user_id).execute()

            except Exception as e:
                print(f"Storage upload error: {e}")

        print(f"[STT] 변환 완료 - transcript 길이: {len(transcript_text)}, speaker_data: {speaker_data is not None}")
        print(f"[STT] transcript 내용: {transcript_text[:200] if transcript_text else '(비어있음)'}...")

        return {
            "transcript": transcript_text,
            "audio_url": audio_url,
            "duration": total_duration,
            "segments": segments,
            "speaker_data": speaker_data
        }

    except Exception as e:
        print(f"[STT] 오류 발생: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"음성 변환 실패: {str(e)}")

    finally:
        # 임시 파일 삭제
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


@router.post("/upload-audio")
async def upload_audio(
    audio: UploadFile = File(...),
    meeting_id: str = Form(...),
    authorization: str = Header(None)
):
    """
    음성 파일만 Supabase Storage에 업로드 (STT 없이)
    """
    user_id = get_user_id_from_token(authorization)

    # 파일 크기 검증 (100MB 제한)
    contents = await audio.read()
    if len(contents) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="파일 크기는 100MB를 초과할 수 없습니다")

    try:
        supabase = get_supabase_client()

        # 파일 확장자 추출
        suffix = ".webm"
        if audio.filename:
            _, ext = os.path.splitext(audio.filename)
            if ext:
                suffix = ext

        file_name = f"{user_id}/{meeting_id}/{uuid.uuid4()}{suffix}"

        # Storage 버킷에 업로드
        supabase.storage.from_("audio-files").upload(
            file_name,
            contents,
            {"content-type": audio.content_type or "audio/webm"}
        )

        # Public URL 생성
        audio_url = supabase.storage.from_("audio-files").get_public_url(file_name)

        # 회의록 업데이트
        supabase.table("meetings").update({
            "audio_url": audio_url,
            "updated_at": datetime.utcnow().isoformat()
        }).eq("id", meeting_id).eq("user_id", user_id).execute()

        return {
            "audio_url": audio_url,
            "message": "업로드 완료"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"업로드 실패: {str(e)}")
