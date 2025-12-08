from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from app.database import get_supabase_client

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


class SignInRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: dict


@router.post("/register", response_model=AuthResponse)
async def register(request: SignUpRequest):
    """회원가입"""
    supabase = get_supabase_client()

    try:
        response = supabase.auth.sign_up({
            "email": request.email,
            "password": request.password,
            "options": {
                "data": {
                    "name": request.name
                }
            }
        })

        if response.user is None:
            raise HTTPException(status_code=400, detail="회원가입에 실패했습니다.")

        return AuthResponse(
            access_token=response.session.access_token,
            refresh_token=response.session.refresh_token,
            user={
                "id": str(response.user.id),
                "email": response.user.email,
                "name": request.name
            }
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=AuthResponse)
async def login(request: SignInRequest):
    """로그인"""
    supabase = get_supabase_client()

    try:
        response = supabase.auth.sign_in_with_password({
            "email": request.email,
            "password": request.password
        })

        if response.user is None:
            raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")

        user_metadata = response.user.user_metadata or {}

        return AuthResponse(
            access_token=response.session.access_token,
            refresh_token=response.session.refresh_token,
            user={
                "id": str(response.user.id),
                "email": response.user.email,
                "name": user_metadata.get("name", "")
            }
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")


@router.post("/refresh")
async def refresh_token(refresh_token: str):
    """토큰 갱신"""
    supabase = get_supabase_client()

    try:
        response = supabase.auth.refresh_session(refresh_token)

        if response.session is None:
            raise HTTPException(status_code=401, detail="토큰 갱신에 실패했습니다.")

        return {
            "access_token": response.session.access_token,
            "refresh_token": response.session.refresh_token
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail="토큰 갱신에 실패했습니다.")


@router.get("/me")
async def get_current_user(authorization: str = None):
    """현재 사용자 정보 조회"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증이 필요합니다.")

    token = authorization.replace("Bearer ", "")
    supabase = get_supabase_client()

    try:
        response = supabase.auth.get_user(token)

        if response.user is None:
            raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")

        user_metadata = response.user.user_metadata or {}

        return {
            "id": str(response.user.id),
            "email": response.user.email,
            "name": user_metadata.get("name", "")
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")
