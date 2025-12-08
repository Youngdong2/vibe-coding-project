import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { meetingsApi } from '../services/api';

export default function NewMeetingPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('제목을 입력해주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      const meeting = await meetingsApi.createMeeting({
        title: title.trim(),
        transcript: transcript.trim() || undefined,
        summary: summary.trim() || undefined,
      });
      navigate(`/meetings/${meeting.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '회의록 생성에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="new-meeting-container">
      <header className="new-meeting-header">
        <Link to="/meetings" className="back-link">
          ← 목록으로
        </Link>
        <h1>새 회의록</h1>
      </header>

      <main className="new-meeting-main">
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="new-meeting-form">
          <div className="form-group">
            <label htmlFor="title">제목 *</label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="회의 제목을 입력하세요"
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="summary">요약</label>
            <textarea
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="회의 요약을 입력하세요 (선택사항)"
              rows={5}
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="transcript">전문</label>
            <textarea
              id="transcript"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="회의 전문을 입력하세요 (선택사항)"
              rows={10}
              disabled={isSubmitting}
            />
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="submit-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? '생성 중...' : '회의록 생성'}
            </button>
            <Link to="/meetings" className="cancel-link">
              취소
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
