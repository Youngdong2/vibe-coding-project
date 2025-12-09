import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { meetingsApi, sttApi } from '../services/api';
import type { Meeting, SpeakerData, SpeakerSegment } from '../services/api';
import AudioRecorder from '../components/AudioRecorder';

// 화자별 색상 팔레트
const SPEAKER_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

// 타임스탬프 포맷 함수
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 화자 버블 컴포넌트
interface SpeakerBubbleProps {
  speaker: string;
  text: string;
  startTime: number;
  speakerIndex: number;
}

function SpeakerBubble({ speaker, text, startTime, speakerIndex }: SpeakerBubbleProps) {
  const color = SPEAKER_COLORS[speakerIndex % SPEAKER_COLORS.length];

  return (
    <div className="speaker-bubble" style={{ borderLeftColor: color }}>
      <div className="speaker-header">
        <span className="speaker-name" style={{ color }}>{speaker}</span>
        <span className="speaker-timestamp">{formatTimestamp(startTime)}</span>
      </div>
      <div className="speaker-text">{text}</div>
    </div>
  );
}

// 정렬된 세그먼트 타입
interface SortedSegment {
  speaker: string;
  speakerIndex: number;
  segment: SpeakerSegment;
}

// 화자 데이터에서 시간순 정렬된 세그먼트 추출
function getSortedSegments(speakerData: SpeakerData): SortedSegment[] {
  const allSegments: SortedSegment[] = [];

  speakerData.speakers.forEach((speaker, index) => {
    speaker.segments.forEach(segment => {
      allSegments.push({
        speaker: speaker.name || speaker.id,
        speakerIndex: index,
        segment
      });
    });
  });

  return allSegments.sort((a, b) => a.segment.start - b.segment.start);
}

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
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);

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

  const handleRecordingComplete = async (audioBlob: Blob) => {
    if (!meeting) return;

    try {
      setIsTranscribing(true);
      setShowRecorder(false);

      const result = await sttApi.transcribe(audioBlob, meeting.id);

      // 회의록 데이터 갱신 (speaker_data 포함)
      setMeeting(prev => prev ? {
        ...prev,
        transcript: result.transcript,
        audio_url: result.audio_url,
        speaker_data: result.speaker_data,
      } : null);
      setEditTranscript(result.transcript);

      const speakerInfo = result.speaker_data
        ? ` (${result.speaker_data.speaker_count}명의 화자 감지)`
        : '';
      alert(`음성이 성공적으로 텍스트로 변환되었습니다!${speakerInfo}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : '음성 변환에 실패했습니다.');
    } finally {
      setIsTranscribing(false);
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

        {/* 녹음 섹션 */}
        <section className="meeting-section recording-section">
          <div className="section-header">
            <h2>음성 녹음</h2>
            {!showRecorder && !isTranscribing && (
              <button
                onClick={() => setShowRecorder(true)}
                className="record-toggle-button"
                disabled={isEditing}
              >
                녹음하기
              </button>
            )}
          </div>

          {showRecorder && (
            <AudioRecorder
              onRecordingComplete={handleRecordingComplete}
              disabled={isTranscribing}
            />
          )}

          {isTranscribing && (
            <div className="transcribing-indicator">
              <div className="spinner" />
              <span>음성을 텍스트로 변환 중...</span>
            </div>
          )}

          {meeting.audio_url && (
            <div className="audio-player">
              <audio controls src={meeting.audio_url}>
                브라우저가 오디오 재생을 지원하지 않습니다.
              </audio>
            </div>
          )}
        </section>

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
          <div className="section-header-with-info">
            <h2>전문</h2>
            {meeting.speaker_data && meeting.speaker_data.speaker_count > 0 && (
              <span className="speaker-count-badge">
                {meeting.speaker_data.speaker_count}명의 화자
              </span>
            )}
          </div>
          {isEditing ? (
            <textarea
              value={editTranscript}
              onChange={(e) => setEditTranscript(e.target.value)}
              className="edit-textarea"
              placeholder="회의 내용을 입력하세요"
              rows={15}
            />
          ) : meeting.speaker_data && meeting.speaker_data.speakers.length > 0 ? (
            <div className="speaker-transcript">
              {getSortedSegments(meeting.speaker_data).map((item, index) => (
                <SpeakerBubble
                  key={`${item.speaker}-${index}`}
                  speaker={item.speaker}
                  text={item.segment.text}
                  startTime={item.segment.start}
                  speakerIndex={item.speakerIndex}
                />
              ))}
            </div>
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
