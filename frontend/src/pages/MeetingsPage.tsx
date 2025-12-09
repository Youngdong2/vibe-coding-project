import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { meetingsApi } from '../services/api';
import type { Meeting } from '../services/api';

const ITEMS_PER_PAGE = 10;

// 검색어 하이라이트 컴포넌트
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) {
    return <>{text}</>;
  }

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        regex.test(part) ? (
          <mark key={index} className="search-highlight">{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
}

// 페이지네이션 컴포넌트
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  return (
    <div className="pagination">
      <button
        className="pagination-button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        이전
      </button>

      <div className="pagination-pages">
        {getPageNumbers().map((page, index) => (
          typeof page === 'number' ? (
            <button
              key={index}
              className={`pagination-page ${currentPage === page ? 'active' : ''}`}
              onClick={() => onPageChange(page)}
            >
              {page}
            </button>
          ) : (
            <span key={index} className="pagination-ellipsis">{page}</span>
          )
        ))}
      </div>

      <button
        className="pagination-button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        다음
      </button>
    </div>
  );
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  useEffect(() => {
    loadMeetings(1);
  }, []);

  const loadMeetings = async (page: number) => {
    try {
      setIsLoading(true);
      setSearchMode(false);
      const offset = (page - 1) * ITEMS_PER_PAGE;
      const response = await meetingsApi.getMeetings(ITEMS_PER_PAGE, offset);
      setMeetings(response.meetings);
      setTotalItems(response.total ?? response.count);
      setCurrentPage(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : '회의록을 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (page = 1) => {
    const query = searchQuery.trim();
    if (!query) {
      loadMeetings(1);
      return;
    }

    try {
      setIsSearching(true);
      setError('');
      const offset = (page - 1) * ITEMS_PER_PAGE;
      const response = await meetingsApi.searchMeetings(query, ITEMS_PER_PAGE, offset);
      setMeetings(response.meetings);
      setTotalItems(response.total ?? response.count);
      setSearchMode(true);
      setCurrentPage(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색에 실패했습니다.');
    } finally {
      setIsSearching(false);
    }
  };

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    if (searchMode) {
      handleSearch(page);
    } else {
      loadMeetings(page);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch(1);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchMode(false);
    loadMeetings(1);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm('정말로 이 회의록을 삭제하시겠습니까?')) {
      return;
    }

    try {
      await meetingsApi.deleteMeeting(id);
      // 삭제 후 현재 페이지 다시 로드
      if (searchMode) {
        handleSearch(currentPage);
      } else {
        loadMeetings(currentPage);
      }
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

  const truncateText = (text: string | null, maxLength: number) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  return (
    <div className="meetings-container">
      <header className="meetings-header">
        <h1>회의록</h1>
        <div className="header-actions">
          <span className="user-name">{user?.name}</span>
          <Link to="/settings" className="header-link">
            설정
          </Link>
          <button onClick={logout} className="logout-button">
            로그아웃
          </button>
        </div>
      </header>

      <main className="meetings-main">
        <div className="meetings-toolbar">
          <div className="search-box">
            <input
              type="text"
              placeholder="회의록 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="search-input"
            />
            <button
              onClick={() => handleSearch(1)}
              className="search-button"
              disabled={isSearching}
            >
              {isSearching ? '검색 중...' : '검색'}
            </button>
            {searchMode && (
              <button onClick={clearSearch} className="clear-search-button">
                초기화
              </button>
            )}
          </div>
          <button
            onClick={() => navigate('/meetings/new')}
            className="new-meeting-button"
          >
            + 새 회의록
          </button>
        </div>

        {searchMode && (
          <div className="search-result-info">
            <span>"{searchQuery}" 검색 결과: {totalItems}건</span>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        {isLoading ? (
          <div className="loading">로딩 중...</div>
        ) : meetings.length === 0 ? (
          <div className="empty-state">
            <p>아직 회의록이 없습니다.</p>
            <p>새 회의록을 만들어보세요!</p>
          </div>
        ) : (
          <>
            <div className="meetings-list">
              {meetings.map((meeting) => (
                <Link
                  to={`/meetings/${meeting.id}`}
                  key={meeting.id}
                  className="meeting-card"
                >
                  <div className="meeting-card-header">
                    <h3 className="meeting-title">
                      {searchMode ? (
                        <HighlightText text={meeting.title} query={searchQuery} />
                      ) : (
                        meeting.title
                      )}
                    </h3>
                    <button
                      onClick={(e) => handleDelete(meeting.id, e)}
                      className="delete-button-small"
                      title="삭제"
                    >
                      삭제
                    </button>
                  </div>
                  <p className="meeting-date">{formatDate(meeting.date)}</p>
                  {meeting.summary && (
                    <p className="meeting-summary">
                      {searchMode ? (
                        <HighlightText text={truncateText(meeting.summary, 100)} query={searchQuery} />
                      ) : (
                        truncateText(meeting.summary, 100)
                      )}
                    </p>
                  )}
                </Link>
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </main>
    </div>
  );
}
