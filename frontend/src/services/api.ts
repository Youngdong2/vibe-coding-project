const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

interface ApiError {
  detail: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.detail || '요청에 실패했습니다.');
  }
  return response.json();
}

export const authApi = {
  async register(email: string, password: string, name: string): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    return handleResponse<AuthResponse>(response);
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return handleResponse<AuthResponse>(response);
  },

  async refresh(refreshToken: string): Promise<{ access_token: string; refresh_token: string }> {
    const response = await fetch(`${API_URL}/api/auth/refresh?refresh_token=${refreshToken}`, {
      method: 'POST',
    });
    return handleResponse(response);
  },

  async getMe(accessToken: string): Promise<{ id: string; email: string; name: string }> {
    const response = await fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return handleResponse(response);
  },
};

interface SettingsResponse {
  has_openai_key: boolean;
  has_confluence_token: boolean;
  confluence_site_url: string | null;
  confluence_space_key: string | null;
  confluence_parent_page_id: string | null;
}

function getAuthHeader(): { Authorization: string } | Record<string, never> {
  const tokens = localStorage.getItem('auth_tokens');
  if (tokens) {
    const { access_token } = JSON.parse(tokens);
    return { Authorization: `Bearer ${access_token}` };
  }
  return {};
}

export const settingsApi = {
  async getSettings(): Promise<SettingsResponse> {
    const response = await fetch(`${API_URL}/api/settings`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<SettingsResponse>(response);
  },

  async saveOpenAIKey(apiKey: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/settings/openai-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ api_key: apiKey }),
    });
    return handleResponse(response);
  },

  async validateOpenAIKey(apiKey: string): Promise<{ valid: boolean; message: string }> {
    const response = await fetch(`${API_URL}/api/settings/validate-openai-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey }),
    });
    return handleResponse(response);
  },

  async deleteOpenAIKey(): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/settings/openai-key`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse(response);
  },

  async saveConfluenceSettings(settings: {
    api_token: string;
    site_url: string;
    space_key: string;
    parent_page_id?: string;
  }): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/settings/confluence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(settings),
    });
    return handleResponse(response);
  },
};
