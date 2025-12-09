from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, settings, meetings, stt

app = FastAPI(
    title="Meeting Minutes API",
    description="회의록 작성 및 요약 웹 애플리케이션 API",
    version="0.1.0",
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://localhost:5173",
        "http://192.168.230.104:5173",
        "https://192.168.230.104:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "Meeting Minutes API", "status": "running"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


# 라우터 등록
app.include_router(auth.router)
app.include_router(settings.router)
app.include_router(meetings.router)
app.include_router(stt.router)
