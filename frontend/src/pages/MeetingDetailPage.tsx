import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { meetingsApi, sttApi, summaryApi, confluenceApi } from '../services/api';
import type { Meeting, SpeakerData, SpeakerSegment } from '../services/api';
import AudioRecorder from '../components/AudioRecorder';
import AudioPlayer from '../components/AudioPlayer';
import ReactMarkdown from 'react-markdown';

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
  endTime: number;
  speakerIndex: number;
  isActive?: boolean;
  onSeek?: (time: number) => void;
}

function SpeakerBubble({ speaker, text, startTime, speakerIndex, isActive, onSeek }: SpeakerBubbleProps) {
  const color = SPEAKER_COLORS[speakerIndex % SPEAKER_COLORS.length];

  const handleClick = () => {
    onSeek?.(startTime);
  };

  return (
    <div
      className={`speaker-bubble ${isActive ? 'active' : ''}`}
      style={{ borderLeftColor: color }}
      onClick={handleClick}
    >
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
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
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isUploadingToConfluence, setIsUploadingToConfluence] = useState(false);
  const [confluenceUrl, setConfluenceUrl] = useState<string | null>(null);
  const [currentAudioTime, setCurrentAudioTime] = useState(0);

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

  const handleGenerateSummary = async (regenerate = false) => {
    if (!meeting) return;

    try {
      setIsGeneratingSummary(true);
      const result = await summaryApi.generateSummary(meeting.id, regenerate);

      setMeeting(prev => prev ? { ...prev, summary: result.summary } : null);
      setEditSummary(result.summary);

      alert(regenerate ? '요약이 재생성되었습니다!' : '요약이 생성되었습니다!');
    } catch (err) {
      alert(err instanceof Error ? err.message : '요약 생성에 실패했습니다.');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleUploadToConfluence = async () => {
    if (!meeting) return;

    try {
      setIsUploadingToConfluence(true);
      const result = await confluenceApi.uploadToConfluence(meeting.id);

      if (result.success) {
        setConfluenceUrl(result.page_url);
        alert(`Confluence 페이지가 생성되었습니다!\n${result.page_url}`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Confluence 업로드에 실패했습니다.');
    } finally {
      setIsUploadingToConfluence(false);
    }
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
            <AudioPlayer
              src={meeting.audio_url}
              ref={audioRef}
              onTimeUpdate={setCurrentAudioTime}
            />
          )}
        </section>

        <section className="meeting-section summary-section">
          <div className="section-header">
            <h2>요약</h2>
            {!isEditing && (
              <div className="summary-actions">
                {meeting.summary ? (
                  <button
                    onClick={() => handleGenerateSummary(true)}
                    className="regenerate-button"
                    disabled={isGeneratingSummary || !meeting.transcript}
                  >
                    {isGeneratingSummary ? '재생성 중...' : '재생성'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleGenerateSummary(false)}
                    className="generate-button"
                    disabled={isGeneratingSummary || !meeting.transcript}
                  >
                    {isGeneratingSummary ? '생성 중...' : 'AI 요약 생성'}
                  </button>
                )}
              </div>
            )}
          </div>
          {isGeneratingSummary && (
            <div className="generating-indicator">
              <div className="spinner" />
              <span>AI가 회의 내용을 분석하고 있습니다...</span>
            </div>
          )}
          {isEditing ? (
            <textarea
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value)}
              className="edit-textarea"
              placeholder="회의 요약을 입력하세요"
              rows={6}
            />
          ) : (
            <div className="meeting-content summary-content">
              {meeting.summary ? (
                <ReactMarkdown>{meeting.summary}</ReactMarkdown>
              ) : (
                <span className="empty-text">
                  {meeting.transcript
                    ? '요약이 없습니다. "AI 요약 생성" 버튼을 눌러 자동으로 생성해보세요.'
                    : '먼저 음성을 녹음하거나 전문을 입력해주세요.'}
                </span>
              )}
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
              {getSortedSegments(meeting.speaker_data).map((item, index) => {
                const isActive = currentAudioTime >= item.segment.start && currentAudioTime < item.segment.end;
                return (
                  <SpeakerBubble
                    key={`${item.speaker}-${index}`}
                    speaker={item.speaker}
                    text={item.segment.text}
                    startTime={item.segment.start}
                    endTime={item.segment.end}
                    speakerIndex={item.speakerIndex}
                    isActive={isActive}
                    onSeek={(time) => {
                      if (audioRef.current) {
                        audioRef.current.currentTime = time;
                        audioRef.current.play();
                      }
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <div className="meeting-content transcript">
              {meeting.transcript || (
                <span className="empty-text">전문이 없습니다.</span>
              )}
            </div>
          )}
        </section>

        {/* Confluence 업로드 섹션 */}
        <section className="meeting-section confluence-section">
          <div className="section-header">
            <h2>Confluence 연동</h2>
          </div>
          <div className="confluence-content">
            {confluenceUrl ? (
              <div className="confluence-success">
                <span>Confluence 페이지가 생성되었습니다!</span>
                <a
                  href={confluenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="confluence-link"
                >
                  페이지 보기 →
                </a>
              </div>
            ) : (
              <>
                <p className="confluence-description">
                  회의록을 Confluence 페이지로 업로드합니다.
                  {!meeting.summary && !meeting.transcript && (
                    <span className="confluence-warning">
                      (요약 또는 전문이 필요합니다)
                    </span>
                  )}
                </p>
                <button
                  onClick={handleUploadToConfluence}
                  className="confluence-upload-button"
                  disabled={isUploadingToConfluence || (!meeting.summary && !meeting.transcript)}
                >
                  {isUploadingToConfluence ? 'Confluence 업로드 중...' : 'Confluence 업로드'}
                </button>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
