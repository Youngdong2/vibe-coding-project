import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function HomePage() {
  const { user, logout } = useAuth();

  return (
    <div className="home-container">
      <header className="home-header">
        <h1>회의록 작성 서비스</h1>
        <div className="user-info">
          <span>{user?.name} ({user?.email})</span>
          <button onClick={logout} className="logout-button">
            로그아웃
          </button>
        </div>
      </header>

      <main className="home-main">
        <div className="welcome-section">
          <h2>환영합니다, {user?.name}님!</h2>
          <p>음성을 녹음하고 AI가 자동으로 회의록을 작성해 드립니다.</p>
        </div>

        <div className="action-cards">
          <div className="action-card">
            <h3>새 회의록 작성</h3>
            <p>음성 녹음을 시작하여 새로운 회의록을 만드세요.</p>
            <Link to="/meetings/new" className="card-button">
              새 회의록
            </Link>
          </div>

          <div className="action-card">
            <h3>회의록 목록</h3>
            <p>저장된 회의록을 확인하고 관리하세요.</p>
            <Link to="/meetings" className="card-button">
              목록 보기
            </Link>
          </div>

          <div className="action-card">
            <h3>설정</h3>
            <p>API 키 및 Confluence 연동을 설정하세요.</p>
            <Link to="/settings" className="card-button">
              설정하기
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
