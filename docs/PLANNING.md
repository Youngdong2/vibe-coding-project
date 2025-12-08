# 회의록 작성 및 요약 웹 애플리케이션 기획안

## 1. 프로젝트 개요

### 1.1 목적
팀 회의 음성을 녹음하고, AI를 활용하여 자동으로 텍스트 변환(화자 분리 포함) 및 요약을 생성하는 웹 애플리케이션

### 1.2 주요 사용자
- AI팀 (초기 사용자)
- 향후 다른 팀으로 확장 가능

### 1.3 1차 MVP 기능 범위
| 기능 | 포함 여부 |
|------|----------|
| 음성 녹음 + STT (화자 분리) | ✅ |
| AI 요약 | ✅ |
| 회의록 저장/조회 | ✅ |
| 팀 공유 | ✅ |
| 검색 | ✅ |
| Confluence 연동 | ✅ |
| 사용자 인증 (로그인) | ✅ |
| 음성 파일 자동 삭제 (90일) | ✅ |
| 화자 이름 매핑 | ❌ (2차) |
| 실시간 동시 편집 | ❌ (2차) |

---

## 2. 기술 스택

### 2.1 Backend
- **Framework**: FastAPI (Python 3.13)
- **BaaS**: Supabase (PostgreSQL + Auth + Storage + Realtime)
- **ASGI Server**: Uvicorn

### 2.2 Frontend
- **Framework**: React 18+
- **UI Library**: shadcn/ui 또는 Material-UI
- **Real-time**: Supabase Realtime (WebSocket 기반)

### 2.3 AI/ML APIs
- **STT (음성→텍스트)**: OpenAI `gpt-4o-transcribe` (화자 분리 지원)
- **요약**: OpenAI `gpt-4o-mini`
- **API Key 관리**: 웹 UI에서 등록/저장 (Supabase에 암호화 저장)

### 2.4 Infrastructure (Supabase 기반)
- **Database**: Supabase PostgreSQL (무료: 500MB, Pro: 무제한)
- **Storage**: Supabase Storage (무료: 1GB, Pro: 100GB 포함)
- **Authentication**: Supabase Auth (이메일/비밀번호)
- **Realtime**: Supabase Realtime (실시간 동기화)
- **Backend Server**: Railway 또는 Render (FastAPI 배포, 무료~$5/월)

### 2.5 Supabase 선택 이유
| 항목 | Supabase | AWS |
|------|----------|-----|
| 설정 복잡도 | 매우 간단 (5분) | 복잡 (수시간) |
| 무료 티어 | 500MB DB, 1GB Storage | 제한적 |
| 월 비용 | $0~25 | $35~100+ |
| 인증 기능 | 내장 (간편) | Cognito (복잡) |
| 실시간 기능 | 내장 (우수) | 별도 구축 필요 |

**선택 이유:**
- 빠른 개발 속도 (MVP 우선)
- 낮은 비용
- 실시간 회의록 동기화에 적합
- 한국어 검색 지원 (PostgreSQL FTS)
- 소규모 팀에 최적화

### 2.6 External Integration
- **Confluence Cloud API** (API Token 방식)

---

## 3. 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                        사용자 브라우저                        │
│                         (React SPA)                         │
└──────────┬──────────────────────────────┬───────────────────┘
           │ Supabase SDK                 │ HTTPS
           ▼                              ▼
┌──────────────────────┐     ┌────────────────────────────────┐
│      Supabase        │     │      FastAPI 백엔드 서버        │
│  ┌────────────────┐  │     │       (Railway/Render)         │
│  │ PostgreSQL DB  │  │     │  ┌──────────┬───────────────┐  │
│  │ (회의록 저장)   │  │     │  │ STT 처리 │ 요약 생성     │  │
│  ├────────────────┤  │     │  │ (OpenAI) │ (OpenAI)      │  │
│  │ Storage        │  │     │  ├──────────┴───────────────┤  │
│  │ (음성 파일)     │  │     │  │ Confluence 연동          │  │
│  ├────────────────┤  │     │  └──────────────────────────┘  │
│  │ Auth           │  │     └────────────────┬───────────────┘
│  │ (로그인/인증)   │  │                      │
│  ├────────────────┤  │                      ▼
│  │ Realtime       │  │            ┌──────────────────┐
│  │ (실시간 동기화) │  │            │    OpenAI API    │
│  └────────────────┘  │            │ (STT + 요약)     │
└──────────────────────┘            └──────────────────┘
                                             │
                                             ▼
                                    ┌──────────────────┐
                                    │  Confluence API  │
                                    └──────────────────┘
```

### 흐름 설명
1. **인증**: React → Supabase Auth (로그인/회원가입)
2. **음성 업로드**: React → Supabase Storage
3. **STT 처리**: React → FastAPI → OpenAI API → Supabase DB 저장
4. **회의록 조회**: React → Supabase DB (실시간 구독 가능)
5. **Confluence 업로드**: React → FastAPI → Confluence API

---

## 4. 핵심 기능 상세

### 4.1 음성 녹음 및 STT

**Flow:**
1. 사용자가 브라우저에서 녹음 시작
2. MediaRecorder API로 음성 캡처 (webm/opus 포맷)
3. 녹음 완료 후 Supabase Storage에 업로드
4. OpenAI `gpt-4o-transcribe` API 호출
5. 화자 분리된 텍스트 반환 (Speaker 0, Speaker 1, ...)

**제약사항:**
- 파일 크기: 최대 25MB
- 긴 회의: 청크 분할 후 병합 처리

### 4.2 AI 요약

**Flow:**
1. STT 완료된 전문(full transcript) 획득
2. `gpt-4o-mini`에 요약 프롬프트 전송
3. 구조화된 요약 생성:
   - 참석자 (화자 기반)
   - 주요 논의 사항
   - 결정 사항
   - 액션 아이템

**요약 템플릿:**
```markdown
## 회의 요약

### 참석자
- Speaker 0, Speaker 1, ...

### 주요 논의 사항
1. [주제 1]: 내용 요약
2. [주제 2]: 내용 요약

### 결정 사항
- [결정 1]
- [결정 2]

### 액션 아이템
- [ ] [할 일] - 담당: [화자]
```

### 4.3 회의록 저장/조회

**데이터 모델:**
```
Meeting
├── id (PK)
├── title
├── date
├── audio_url (Storage 링크)
├── transcript (전문)
├── summary (요약)
├── speaker_data (JSONB - 화자별 발언)
├── created_at
├── updated_at
└── team_id (FK)
```

### 4.4 검색

- PostgreSQL Full Text Search 사용
- 한국어 형태소 분석 지원 (PGroonga 확장 가능)
- 제목, 전문, 요약 전체 검색

### 4.5 팀 공유

- 초기에는 단일 팀(AI팀)으로 시작
- 모든 팀원이 회의록 조회/편집 가능
- 향후 팀 구분 기능 추가 가능

### 4.6 사용자 인증

**방식:** Supabase Auth (이메일 + 비밀번호)
- 회원가입: 이메일, 비밀번호, 이름
- 로그인: JWT 토큰 발급
- 세션 유지: Access Token + Refresh Token

### 4.7 Confluence 연동

**Flow:**
1. 회의록 상세 페이지에서 "Confluence 업로드" 버튼 클릭
2. **사전 설정된 Space + 경로**에 페이지 생성
3. 요약 + 전문을 Confluence 포맷으로 변환하여 업로드

**설정 (설정 페이지에서 관리):**
- Confluence Site URL
- API Token
- 기본 Space Key
- 기본 상위 페이지 ID (경로)

### 4.8 음성 파일 자동 삭제

- Supabase Storage에 저장된 음성 파일은 **90일 후 자동 삭제**
- Supabase Edge Function + Cron Job으로 구현
- 회의록 텍스트(전문, 요약)는 영구 보관

### 4.9 OpenAI API Key 관리

**사용자가 웹 UI에서 API Key 등록:**
- 설정 페이지에서 OpenAI API Key 입력
- 한 번 등록하면 재등록 불필요
- Supabase DB에 암호화하여 저장

**보안:**
- API Key는 서버(FastAPI)에서만 사용
- 클라이언트에 노출되지 않음
- 등록된 Key 유효성 검증 후 저장

**데이터 모델:**
```
Settings
├── id (PK)
├── user_id (FK)
├── openai_api_key (암호화 저장)
├── confluence_api_token (암호화 저장)
├── confluence_site_url
├── confluence_space_key
├── confluence_parent_page_id
└── updated_at
```

---

## 5. 화면 구성

### 5.1 메인 페이지 (회의록 목록)
- 최근 회의록 리스트 (날짜, 제목, 요약 미리보기)
- 검색 바
- "새 회의록" 버튼

### 5.2 녹음 페이지
- 녹음 시작/정지 버튼
- 녹음 시간 표시
- 파형 시각화 (선택)
- 제목 입력

### 5.3 회의록 상세 페이지
- 요약 섹션
- 전문 섹션 (화자별 구분 표시)
- 편집 기능
- Confluence 업로드 버튼
- 음성 파일 재생

### 5.4 검색 결과 페이지
- 검색어 하이라이트
- 관련 회의록 목록

### 5.5 로그인/회원가입 페이지
- 이메일 + 비밀번호 로그인
- 회원가입 폼 (이메일, 비밀번호, 이름)

### 5.6 설정 페이지
- **OpenAI API Key 등록** (필수, 최초 1회)
- Confluence 연동 설정 (Site URL, API Token, Space, 경로)
- 프로필 관리

---

## 6. API 설계

### 6.1 회의록 API
```
POST   /api/meetings              # 새 회의록 생성
GET    /api/meetings              # 회의록 목록 조회
GET    /api/meetings/{id}         # 회의록 상세 조회
PUT    /api/meetings/{id}         # 회의록 수정
DELETE /api/meetings/{id}         # 회의록 삭제
GET    /api/meetings/search?q=    # 검색
```

### 6.2 음성 처리 API
```
POST   /api/audio/upload          # 음성 파일 업로드
POST   /api/audio/transcribe      # STT 처리 요청
GET    /api/audio/transcribe/{id} # STT 상태 조회
```

### 6.3 요약 API
```
POST   /api/summary/generate      # 요약 생성
```

### 6.4 Confluence API
```
POST   /api/confluence/publish    # Confluence에 업로드
GET    /api/confluence/spaces     # Space 목록 조회
```

### 6.5 인증 API
```
POST   /api/auth/register         # 회원가입
POST   /api/auth/login            # 로그인 (JWT 발급)
POST   /api/auth/refresh          # 토큰 갱신
GET    /api/auth/me               # 현재 사용자 정보
```

### 6.6 설정 API
```
GET    /api/settings              # 설정 조회
PUT    /api/settings              # 설정 수정
POST   /api/settings/validate-openai-key  # OpenAI API Key 유효성 검증
```

---

## 7. 데이터베이스 스키마

### 7.1 ERD (Entity Relationship Diagram)

```
┌─────────────────┐       ┌─────────────────┐
│     users       │       │    settings     │
│  (Supabase Auth)│       │                 │
├─────────────────┤       ├─────────────────┤
│ id (PK, UUID)   │──────<│ user_id (FK)    │
│ email           │       │ id (PK, UUID)   │
│ created_at      │       │ openai_api_key  │
│ ...             │       │ confluence_*    │
└─────────────────┘       └─────────────────┘
        │
        │ 1:N
        ▼
┌─────────────────┐
│    meetings     │
├─────────────────┤
│ id (PK, UUID)   │
│ user_id (FK)    │
│ title           │
│ date            │
│ audio_url       │
│ transcript      │
│ summary         │
│ speaker_data    │
│ status          │
│ created_at      │
│ updated_at      │
└─────────────────┘
```

### 7.2 테이블 상세

#### users (Supabase Auth 자동 생성)
Supabase Auth가 자동으로 관리하는 테이블입니다.

```sql
-- Supabase Auth가 자동 생성 (auth.users)
-- 추가 프로필 정보가 필요하면 public.profiles 테이블 생성
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 정책
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);
```

#### meetings (회의록)
```sql
CREATE TABLE public.meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- 기본 정보
    title TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- 음성 파일
    audio_url TEXT,                    -- Supabase Storage URL
    audio_duration INTEGER,            -- 녹음 길이 (초)

    -- 텍스트 내용
    transcript TEXT,                   -- 전체 전문
    summary TEXT,                      -- AI 요약

    -- 화자 정보 (JSON)
    speaker_data JSONB DEFAULT '[]',
    -- 예: [{"speaker": "Speaker 0", "text": "안녕하세요", "start": 0, "end": 2.5}, ...]

    -- 상태
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'completed', 'failed')),

    -- 메타데이터
    confluence_page_id TEXT,           -- Confluence 업로드 시 페이지 ID
    confluence_url TEXT,               -- Confluence 페이지 URL

    -- 타임스탬프
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_meetings_user_id ON public.meetings(user_id);
CREATE INDEX idx_meetings_date ON public.meetings(date DESC);
CREATE INDEX idx_meetings_status ON public.meetings(status);

-- 전문 검색 인덱스 (한국어 지원)
CREATE INDEX idx_meetings_search ON public.meetings
    USING GIN (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(transcript, '') || ' ' || coalesce(summary, '')));

-- RLS 정책
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own meetings"
    ON public.meetings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meetings"
    ON public.meetings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meetings"
    ON public.meetings FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own meetings"
    ON public.meetings FOR DELETE
    USING (auth.uid() = user_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_meetings_updated_at
    BEFORE UPDATE ON public.meetings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

#### settings (사용자 설정)
```sql
CREATE TABLE public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

    -- OpenAI 설정 (암호화 저장)
    openai_api_key_encrypted TEXT,     -- 암호화된 API Key

    -- Confluence 설정
    confluence_site_url TEXT,          -- 예: https://yoursite.atlassian.net
    confluence_api_token_encrypted TEXT, -- 암호화된 API Token
    confluence_user_email TEXT,        -- Confluence 사용자 이메일
    confluence_space_key TEXT,         -- 기본 Space Key
    confluence_parent_page_id TEXT,    -- 기본 상위 페이지 ID

    -- 타임스탬프
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 정책
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
    ON public.settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
    ON public.settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
    ON public.settings FOR UPDATE
    USING (auth.uid() = user_id);

-- updated_at 트리거
CREATE TRIGGER update_settings_updated_at
    BEFORE UPDATE ON public.settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 7.3 Storage 버킷 구조

```
audio-recordings/
├── {user_id}/
│   ├── {meeting_id}/
│   │   └── recording.webm
│   └── ...
└── ...
```

**Storage 정책:**
```sql
-- 버킷 생성
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-recordings', 'audio-recordings', false);

-- RLS 정책: 본인 파일만 접근 가능
CREATE POLICY "Users can upload own audio"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'audio-recordings' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can view own audio"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'audio-recordings' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can delete own audio"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'audio-recordings' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );
```

### 7.4 샘플 데이터 (speaker_data JSON 구조)

```json
{
  "speakers": [
    {
      "id": "Speaker 0",
      "name": null,
      "segments": [
        {
          "start": 0.0,
          "end": 5.2,
          "text": "안녕하세요, 오늘 회의를 시작하겠습니다."
        },
        {
          "start": 15.3,
          "end": 22.1,
          "text": "첫 번째 안건은 신규 기능 개발입니다."
        }
      ]
    },
    {
      "id": "Speaker 1",
      "name": null,
      "segments": [
        {
          "start": 5.5,
          "end": 14.8,
          "text": "네, 반갑습니다. 지난주 진행 상황부터 공유드리겠습니다."
        }
      ]
    }
  ],
  "total_duration": 3600,
  "speaker_count": 2
}
```

---

## 8. 프로젝트 구조

```
vibe-coding-project/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 앱 진입점
│   │   ├── config.py            # 설정 (환경변수)
│   │   ├── models/              # Pydantic 모델
│   │   │   ├── meeting.py
│   │   │   ├── user.py
│   │   │   └── settings.py
│   │   ├── routers/             # API 라우터
│   │   │   ├── auth.py
│   │   │   ├── meetings.py
│   │   │   ├── audio.py
│   │   │   ├── summary.py
│   │   │   ├── confluence.py
│   │   │   └── settings.py
│   │   ├── services/            # 비즈니스 로직
│   │   │   ├── openai_service.py
│   │   │   ├── confluence_service.py
│   │   │   └── supabase_service.py
│   │   ├── core/                # 핵심 유틸리티
│   │   │   ├── security.py      # 암호화
│   │   │   └── deps.py          # 의존성
│   │   └── database.py          # Supabase 연결
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/          # React 컴포넌트
│   │   ├── pages/               # 페이지 컴포넌트
│   │   ├── hooks/               # Custom hooks
│   │   ├── services/            # API 호출
│   │   ├── lib/                 # Supabase 클라이언트
│   │   └── App.tsx
│   ├── package.json
│   └── Dockerfile
├── docs/
│   └── PLANNING.md              # 이 문서
├── docker-compose.yml
└── README.md
```

---

## 8. 개발 단계

### Phase 1: 기반 구축
- [ ] Supabase 프로젝트 생성 및 설정
- [ ] FastAPI 프로젝트 초기 설정
- [ ] React 프로젝트 초기 설정 (Vite + TypeScript)
- [ ] Supabase Auth 연동 (회원가입/로그인)
- [ ] 로그인/회원가입 UI

### Phase 2: 핵심 기능
- [ ] 설정 페이지 (OpenAI API Key 등록)
- [ ] 음성 녹음 UI 구현 (MediaRecorder API)
- [ ] Supabase Storage 업로드 구현
- [ ] OpenAI STT 연동 (화자 분리)
- [ ] 요약 생성 기능 구현
- [ ] 회의록 저장/조회 UI

### Phase 3: 부가 기능
- [ ] 검색 기능 (PostgreSQL 전문 검색)
- [ ] Confluence 연동 (설정 페이지 포함)
- [ ] 음성 파일 자동 삭제 (90일)

### Phase 4: 배포 및 마무리
- [ ] Railway/Render에 FastAPI 배포
- [ ] 프론트엔드 배포 (Vercel 또는 Netlify)
- [ ] 테스트 및 버그 수정

---

## 9. 예상 비용

### 9.1 Supabase 비용
| 플랜 | 월 비용 | 포함 내용 |
|------|--------|----------|
| **Free** | $0 | DB 500MB, Storage 1GB, 월 5만 MAU |
| **Pro** | $25 | DB 8GB, Storage 100GB, 무제한 MAU |

**주의사항 (무료 플랜):**
- 1주일 비활성 시 프로젝트 자동 중지 (데이터 보존, 재시작 가능)
- 이를 방지하려면 정기 health check 설정 필요

### 9.2 FastAPI 서버 호스팅 비용
| 서비스 | 월 비용 | 특징 |
|--------|--------|------|
| **Railway** | $0~5 | 무료 $5 크레딧/월, 사용량 기반 |
| **Render** | $0~7 | 무료 티어 있음 (15분 비활성 시 슬립) |
| **Fly.io** | $0~5 | 무료 티어 관대함 |

### 9.3 OpenAI API 비용 (사용자 부담)
| 모델 | 비용 | 예시 |
|------|------|------|
| gpt-4o-transcribe | $0.006/분 | 1시간 회의 = $0.36 |
| gpt-4o-mini | $0.15/1M input tokens | 요약 1건 = ~$0.01 |

**참고:** OpenAI API Key는 사용자가 직접 등록하므로, 이 비용은 사용자가 직접 OpenAI에 지불

### 9.4 총 비용 요약
| 시나리오 | 인프라 비용 | 비고 |
|----------|------------|------|
| **무료 시작** | $0 | Supabase Free + Railway 무료 |
| **안정 운영** | ~$30/월 | Supabase Pro $25 + Railway $5 |

---

## 10. 확정된 결정 사항

| 항목 | 결정 |
|------|------|
| 인프라 | Supabase (PostgreSQL + Auth + Storage) + FastAPI |
| 화자 이름 매핑 | Speaker 0, 1 그대로 사용 (2차 기능으로 보류) |
| Confluence Space | 기본 Space + 경로를 사전 설정 |
| 음성 파일 보관 | 90일 후 자동 삭제 |
| 접근 제한 | 이메일/비밀번호 로그인 (Supabase Auth) |
| OpenAI API Key | 웹 UI 설정 페이지에서 사용자가 등록 |

---

## 11. 다음 단계 (구현 순서)

1. **Supabase 프로젝트 설정**
   - Supabase 프로젝트 생성
   - 데이터베이스 스키마 설계 (meetings, settings 테이블)
   - Storage 버킷 생성 (음성 파일용)
   - Auth 설정 (이메일/비밀번호)

2. **FastAPI 백엔드 구조 생성**
   - `backend/app/` 디렉토리 구조
   - Supabase 클라이언트 연결
   - 환경변수 설정 (`.env`)

3. **프론트엔드 프로젝트 생성**
   - React + TypeScript + Vite
   - Supabase 클라이언트 설정
   - 라우팅 설정

4. **인증 시스템 구현**
   - Supabase Auth 연동 (회원가입/로그인)
   - 로그인/회원가입 UI

5. **설정 페이지 구현**
   - OpenAI API Key 등록 UI
   - Confluence 설정 UI
   - API Key 암호화 저장

6. **핵심 기능 순차 구현**
   - 음성 녹음 → STT → 요약 → 저장 → 검색 → Confluence

---

## 12. 개발 규칙 (Development Rules)

### 12.1 커밋 전략

**원칙: 작은 단위로 자주 커밋한다**

- 하나의 기능 또는 변경사항 완료 시 즉시 커밋
- 커밋 전 해당 기능이 정상 동작하는지 확인
- 커밋 메시지는 변경 내용을 명확하게 설명

### 12.2 커밋 메시지 컨벤션

```
<type>: <subject>

<body> (선택)
```

**Type 종류:**
| Type | 설명 | 예시 |
|------|------|------|
| `feat` | 새로운 기능 추가 | `feat: 음성 녹음 기능 추가` |
| `fix` | 버그 수정 | `fix: 로그인 오류 수정` |
| `docs` | 문서 수정 | `docs: README 업데이트` |
| `style` | 코드 포맷팅 (기능 변경 X) | `style: 코드 정렬` |
| `refactor` | 리팩토링 | `refactor: API 호출 로직 개선` |
| `test` | 테스트 추가/수정 | `test: 로그인 테스트 추가` |
| `chore` | 빌드, 설정 변경 | `chore: 의존성 업데이트` |
| `init` | 초기 설정 | `init: FastAPI 프로젝트 초기화` |

### 12.3 개발 순서 및 커밋 포인트

각 단계 완료 시 커밋합니다. 아래는 예상 커밋 목록입니다.

#### Phase 1: 프로젝트 초기 설정
```
1.  init: 프로젝트 구조 생성
2.  chore: backend 의존성 설정 (requirements.txt)
3.  chore: frontend 프로젝트 초기화 (Vite + React + TypeScript)
4.  feat: Supabase 클라이언트 설정 (backend)
5.  feat: Supabase 클라이언트 설정 (frontend)
6.  feat: 환경변수 설정 (.env.example)
```

#### Phase 2: 인증 시스템
```
7.  feat: Supabase Auth 연동 (backend)
8.  feat: 로그인 페이지 UI
9.  feat: 회원가입 페이지 UI
10. feat: 인증 상태 관리 (Context/Store)
11. feat: 보호된 라우트 구현
```

#### Phase 3: 설정 페이지
```
12. feat: 설정 페이지 레이아웃
13. feat: OpenAI API Key 등록 UI
14. feat: OpenAI API Key 저장 API
15. feat: API Key 유효성 검증
16. feat: Confluence 설정 UI
17. feat: Confluence 설정 저장 API
```

#### Phase 4: 회의록 기본 기능
```
18. feat: 회의록 목록 페이지
19. feat: 회의록 상세 페이지
20. feat: 새 회의록 생성
21. feat: 회의록 수정
22. feat: 회의록 삭제
```

#### Phase 5: 음성 녹음 및 STT
```
23. feat: 녹음 페이지 레이아웃
24. feat: MediaRecorder API 연동
25. feat: 녹음 시작/정지 기능
26. feat: Supabase Storage 업로드
27. feat: OpenAI STT API 연동
28. feat: 화자 분리 결과 파싱
29. feat: STT 결과 저장
```

#### Phase 6: AI 요약
```
30. feat: 요약 생성 API
31. feat: 요약 UI 표시
32. feat: 요약 재생성 기능
```

#### Phase 7: 검색
```
33. feat: 검색 API (PostgreSQL FTS)
34. feat: 검색 UI
35. feat: 검색 결과 하이라이트
```

#### Phase 8: Confluence 연동
```
36. feat: Confluence 업로드 API
37. feat: 업로드 버튼 및 UI
38. feat: 업로드 결과 표시
```

#### Phase 9: 부가 기능
```
39. feat: 음성 파일 재생 기능
40. feat: 회의록 목록 페이지네이션
41. chore: 90일 지난 음성 파일 삭제 설정
```

#### Phase 10: 배포
```
42. chore: Docker 설정
43. chore: Railway/Render 배포 설정
44. docs: 배포 가이드 작성
```

### 12.4 브랜치 전략

**간단한 브랜치 전략 사용:**

```
main (배포용)
  └── develop (개발용)
        ├── feature/auth
        ├── feature/recording
        ├── feature/stt
        └── ...
```

- `main`: 배포 가능한 안정 버전
- `develop`: 개발 중인 버전 (기본 작업 브랜치)
- `feature/*`: 기능별 브랜치 (선택사항)

**MVP 단계에서는 `main` 브랜치에서 직접 작업해도 무방합니다.**

### 12.5 코드 리뷰 규칙

MVP 단계에서는 생략하되, 다음 사항은 스스로 확인:
- [ ] 코드가 의도대로 동작하는가?
- [ ] 콘솔에 에러가 없는가?
- [ ] 민감한 정보(API Key 등)가 노출되지 않았는가?

### 12.6 테스트 규칙

MVP 단계에서는 수동 테스트로 진행:
- 각 기능 완료 후 직접 동작 확인
- 주요 시나리오 테스트 (로그인 → 녹음 → STT → 요약 → 저장)
