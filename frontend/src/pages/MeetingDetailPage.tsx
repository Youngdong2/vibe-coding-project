import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { meetingsApi } from '../services/api';
import type { Meeting } from '../services/api';

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editTranscript, setEditTranscript] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (id) {
      loadMeeting();
    }
  }, [id]);

  const loadMeeting = async () => {
    try {
      setIsLoading(true);
      const data = await meetingsApi.getMeeting(id!);
      setMeeting(data);
      setEditTitle(data.title);
      setEditTranscript(data.transcript || '');
      setEditSummary(data.summary || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : '회의록을 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!meeting) return;

    try {
      setIsSaving(true);
      const updated = await meetingsApi.updateMeeting(meeting.id, {
        title: editTitle,
        transcript: editTranscript,
        summary: editSummary,
      });
      setMeeting(updated);
      setIsEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!meeting) return;

    if (!confirm('정말로 이 회의록을 삭제하시겠습니까?')) {
      return;
    }

    try {
      await meetingsApi.deleteMeeting(meeting.id);
      navigate('/meetings');
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="meeting-detail-container">
        <div className="loading">로딩 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="meeting-detail-container">
        <div className="error-message">{error}</div>
        <Link to="/meetings" className="back-link">
          목록으로 돌아가기
        </Link>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="meeting-detail-container">
        <div className="error-message">회의록을 찾을 수 없습니다.</div>
        <Link to="/meetings" className="back-link">
          목록으로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div className="meeting-detail-container">
      <header className="meeting-detail-header">
        <Link to="/meetings" className="back-link">
          ← 목록으로
        </Link>
        <div className="header-actions">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                className="save-button"
                disabled={isSaving}
              >
                {isSaving ? '저장 중...' : '저장'}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditTitle(meeting.title);
                  setEditTranscript(meeting.transcript || '');
                  setEditSummary(meeting.summary || '');
                }}
                className="cancel-button"
              >
                취소
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setIsEditing(true)} className="edit-button">
                수정
              </button>
              <button onClick={handleDelete} className="delete-button">
                삭제
              </button>
            </>
          )}
        </div>
      </header>

      <main className="meeting-detail-main">
        <div className="meeting-info">
          {isEditing ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="edit-title-input"
              placeholder="회의 제목"
            />
          ) : (
            <h1 className="meeting-title">{meeting.title}</h1>
          )}
          <p className="meeting-date">{formatDate(meeting.date)}</p>
        </div>

        <section className="meeting-section">
          <h2>요약</h2>
          {isEditing ? (
            <textarea
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value)}
              className="edit-textarea"
              placeholder="회의 요약을 입력하세요"
              rows={6}
            />
          ) : (
            <div className="meeting-content">
              {meeting.summary || <span className="empty-text">요약이 없습니다.</span>}
            </div>
          )}
        </section>

        <section className="meeting-section">
          <h2>전문</h2>
          {isEditing ? (
            <textarea
              value={editTranscript}
              onChange={(e) => setEditTranscript(e.target.value)}
              className="edit-textarea"
              placeholder="회의 내용을 입력하세요"
              rows={15}
            />
          ) : (
            <div className="meeting-content transcript">
              {meeting.transcript || (
                <span className="empty-text">전문이 없습니다.</span>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
