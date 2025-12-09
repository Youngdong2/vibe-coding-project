import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { settingsApi } from '../services/api';

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);
  const [hasConfluenceToken, setHasConfluenceToken] = useState(false);

  // OpenAI 설정
  const [openaiKey, setOpenaiKey] = useState('');
  const [openaiError, setOpenaiError] = useState('');
  const [openaiSuccess, setOpenaiSuccess] = useState('');
  const [isSavingOpenAI, setIsSavingOpenAI] = useState(false);

  // Confluence 설정
  const [confluenceToken, setConfluenceToken] = useState('');
  const [confluenceSiteUrl, setConfluenceSiteUrl] = useState('');
  const [confluenceSpaceKey, setConfluenceSpaceKey] = useState('');
  const [confluenceParentPageId, setConfluenceParentPageId] = useState('');
  const [confluenceError, setConfluenceError] = useState('');
  const [confluenceSuccess, setConfluenceSuccess] = useState('');
  const [isSavingConfluence, setIsSavingConfluence] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await settingsApi.getSettings();
        setHasOpenAIKey(settings.has_openai_key);
        setHasConfluenceToken(settings.has_confluence_token);
        setConfluenceSiteUrl(settings.confluence_site_url || '');
        setConfluenceSpaceKey(settings.confluence_space_key || '');
        setConfluenceParentPageId(settings.confluence_parent_page_id || '');
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleSaveOpenAI = async (e: FormEvent) => {
    e.preventDefault();
    setOpenaiError('');
    setOpenaiSuccess('');
    setIsSavingOpenAI(true);

    try {
      await settingsApi.saveOpenAIKey(openaiKey);
      setOpenaiSuccess('OpenAI API Key가 저장되었습니다.');
      setHasOpenAIKey(true);
      setOpenaiKey('');
    } catch (err) {
      setOpenaiError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSavingOpenAI(false);
    }
  };

  const handleDeleteOpenAI = async () => {
    if (!confirm('OpenAI API Key를 삭제하시겠습니까?')) return;

    try {
      await settingsApi.deleteOpenAIKey();
      setHasOpenAIKey(false);
      setOpenaiSuccess('OpenAI API Key가 삭제되었습니다.');
    } catch (err) {
      setOpenaiError(err instanceof Error ? err.message : '삭제에 실패했습니다.');
    }
  };

  const handleSaveConfluence = async (e: FormEvent) => {
    e.preventDefault();
    setConfluenceError('');
    setConfluenceSuccess('');
    setIsSavingConfluence(true);

    try {
      await settingsApi.saveConfluenceSettings({
        api_token: confluenceToken,
        site_url: confluenceSiteUrl,
        space_key: confluenceSpaceKey,
        parent_page_id: confluenceParentPageId || undefined,
      });
      setConfluenceSuccess('Confluence 설정이 저장되었습니다.');
      setHasConfluenceToken(true);
      setConfluenceToken('');
    } catch (err) {
      setConfluenceError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSavingConfluence(false);
    }
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <header className="settings-header">
        <Link to="/" className="back-link">&larr; 홈으로</Link>
        <h1>설정</h1>
      </header>

      <main className="settings-main">
        {/* OpenAI API Key 섹션 */}
        <section className="settings-section">
          <h2>OpenAI API Key</h2>
          <p className="section-description">
            회의록 STT 및 요약 기능을 사용하려면 OpenAI API Key가 필요합니다.
          </p>

          {hasOpenAIKey ? (
            <div className="key-status">
              <span className="status-badge status-active">등록됨</span>
              <button onClick={handleDeleteOpenAI} className="delete-button">
                삭제
              </button>
            </div>
          ) : (
            <form onSubmit={handleSaveOpenAI} className="settings-form">
              {openaiError && <div className="form-error">{openaiError}</div>}
              {openaiSuccess && <div className="form-success">{openaiSuccess}</div>}

              <div className="form-group">
                <label htmlFor="openaiKey">API Key</label>
                <input
                  type="password"
                  id="openaiKey"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-..."
                  required
                  disabled={isSavingOpenAI}
                />
              </div>

              <button type="submit" className="save-button" disabled={isSavingOpenAI}>
                {isSavingOpenAI ? '저장 중...' : '저장'}
              </button>
            </form>
          )}

          {openaiSuccess && hasOpenAIKey && (
            <div className="form-success">{openaiSuccess}</div>
          )}
        </section>

        {/* Confluence 섹션 */}
        <section className="settings-section">
          <h2>Confluence 연동</h2>
          <p className="section-description">
            회의록을 Confluence에 업로드하려면 설정이 필요합니다.
          </p>

          <form onSubmit={handleSaveConfluence} className="settings-form">
            {confluenceError && <div className="form-error">{confluenceError}</div>}
            {confluenceSuccess && <div className="form-success">{confluenceSuccess}</div>}

            <div className="form-group">
              <label htmlFor="confluenceSiteUrl">Site URL</label>
              <input
                type="url"
                id="confluenceSiteUrl"
                value={confluenceSiteUrl}
                onChange={(e) => setConfluenceSiteUrl(e.target.value)}
                placeholder="https://your-domain.atlassian.net"
                required
                disabled={isSavingConfluence}
              />
              <small className="form-hint">Confluence 사이트 주소 (예: https://myteam.atlassian.net)</small>
            </div>

            <div className="form-group">
              <label htmlFor="confluenceToken">
                API Token
                {hasConfluenceToken && <span className="status-badge status-active">등록됨</span>}
              </label>
              <input
                type="password"
                id="confluenceToken"
                value={confluenceToken}
                onChange={(e) => setConfluenceToken(e.target.value)}
                placeholder={hasConfluenceToken ? '새 토큰으로 변경하려면 입력' : 'email@example.com:your-api-token'}
                required={!hasConfluenceToken}
                disabled={isSavingConfluence}
              />
              <small className="form-hint">
                형식: 이메일:API토큰 (예: user@company.com:ATATT3xF...)
                <br />
                API 토큰은{' '}
                <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer">
                  Atlassian 계정 설정
                </a>
                에서 생성할 수 있습니다.
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="confluenceSpaceKey">Space Key</label>
              <input
                type="text"
                id="confluenceSpaceKey"
                value={confluenceSpaceKey}
                onChange={(e) => setConfluenceSpaceKey(e.target.value)}
                placeholder="예: MEETING"
                required
                disabled={isSavingConfluence}
              />
              <small className="form-hint">
                URL에서 확인: .../wiki/spaces/<strong>SPACEKEY</strong>/...
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="confluenceParentPageId">상위 페이지 ID (선택)</label>
              <input
                type="text"
                id="confluenceParentPageId"
                value={confluenceParentPageId}
                onChange={(e) => setConfluenceParentPageId(e.target.value)}
                placeholder="예: 123456789"
                disabled={isSavingConfluence}
              />
              <small className="form-hint">
                페이지 URL에서 확인: .../pages/<strong>123456789</strong>/...
              </small>
            </div>

            <button type="submit" className="save-button" disabled={isSavingConfluence}>
              {isSavingConfluence ? '저장 중...' : '저장'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
