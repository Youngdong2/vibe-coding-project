# 개발 진행 현황

> 마지막 업데이트: 2025-12-08

## 전체 진행률

### Phase 1: 프로젝트 초기 설정 ✅
- [x] 프로젝트 구조 생성
- [x] Backend 의존성 설정 (requirements.txt)
- [x] Frontend 프로젝트 초기화 (Vite + React + TypeScript)
- [x] Supabase 클라이언트 설정 (backend)
- [x] Supabase 클라이언트 설정 (frontend)
- [x] 환경변수 설정 (.env.example)

### Phase 2: 인증 시스템 ✅
- [x] Supabase Auth 연동 (backend)
- [x] 로그인 페이지 UI
- [x] 회원가입 페이지 UI
- [x] 인증 상태 관리 (Context/Store)
- [x] 보호된 라우트 구현

### Phase 3: 설정 페이지 ✅
- [x] 설정 페이지 레이아웃
- [x] OpenAI API Key 등록 UI
- [x] OpenAI API Key 저장 API
- [x] API Key 유효성 검증
- [x] Confluence 설정 UI
- [x] Confluence 설정 저장 API

### Phase 4: 회의록 기본 기능 🔲
- [ ] 회의록 목록 페이지
- [ ] 회의록 상세 페이지
- [ ] 새 회의록 생성
- [ ] 회의록 수정
- [ ] 회의록 삭제

### Phase 5: 음성 녹음 및 STT 🔲
- [ ] 녹음 페이지 레이아웃
- [ ] MediaRecorder API 연동
- [ ] 녹음 시작/정지 기능
- [ ] Supabase Storage 업로드
- [ ] OpenAI STT API 연동
- [ ] 화자 분리 결과 파싱
- [ ] STT 결과 저장

### Phase 6: AI 요약 🔲
- [ ] 요약 생성 API
- [ ] 요약 UI 표시
- [ ] 요약 재생성 기능

### Phase 7: 검색 🔲
- [ ] 검색 API (PostgreSQL FTS)
- [ ] 검색 UI
- [ ] 검색 결과 하이라이트

### Phase 8: Confluence 연동 🔲
- [ ] Confluence 업로드 API
- [ ] 업로드 버튼 및 UI
- [ ] 업로드 결과 표시

### Phase 9: 부가 기능 🔲
- [ ] 음성 파일 재생 기능
- [ ] 회의록 목록 페이지네이션
- [ ] 90일 지난 음성 파일 삭제 설정

### Phase 10: 배포 🔲
- [ ] Docker 설정
- [ ] Railway/Render 배포 설정
- [ ] 배포 가이드 작성

---

## 커밋 히스토리

| # | 커밋 메시지 | 해시 | 날짜 |
|---|------------|------|------|
| 1 | init: 프로젝트 구조 생성 | ea38631 | 2025-12-08 |

---

## 현재 작업

**Phase 3: 설정 페이지** 완료

---

## 다음 할 일

1. Phase 4: 회의록 기본 기능 시작
2. Supabase에 settings, meetings 테이블 생성 필요
3. 회의록 목록 페이지 구현

---

## 메모

- Supabase 프로젝트 생성 필요 (https://supabase.com)
- `.env` 파일에 Supabase URL, Key 설정 필요
- settings 테이블 스키마 필요 (user_id, openai_api_key, confluence_* 필드)
