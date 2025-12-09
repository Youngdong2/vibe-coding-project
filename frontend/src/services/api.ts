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

interface RegisterResponse {
  message: string;
  user: {
    id: string;
    email: string;
    name: string;
  } | null;
  requires_email_verification: boolean;
  access_token: string | null;
  refresh_token: string | null;
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
  async register(email: string, password: string, name: string): Promise<RegisterResponse> {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    return handleResponse<RegisterResponse>(response);
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

// 화자 분리 관련 타입
export interface SpeakerSegment {
  start: number;
  end: number;
  text: string;
}

export interface Speaker {
  id: string;
  name: string | null;
  segments: SpeakerSegment[];
}

export interface SpeakerData {
  speakers: Speaker[];
  total_duration: number;
  speaker_count: number;
}

// 회의록 관련 타입
export interface Meeting {
  id: string;
  user_id: string;
  title: string;
  date: string;
  audio_url: string | null;
  transcript: string | null;
  summary: string | null;
  speaker_data: SpeakerData | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingCreate {
  title: string;
  date?: string;
  transcript?: string;
  summary?: string;
}

export interface MeetingUpdate {
  title?: string;
  transcript?: string;
  summary?: string;
}

export const meetingsApi = {
  async getMeetings(limit = 20, offset = 0): Promise<{ meetings: Meeting[]; count: number }> {
    const response = await fetch(
      `${API_URL}/api/meetings?limit=${limit}&offset=${offset}`,
      { headers: { ...getAuthHeader() } }
    );
    return handleResponse(response);
  },

  async getMeeting(id: string): Promise<Meeting> {
    const response = await fetch(`${API_URL}/api/meetings/${id}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(response);
  },

  async createMeeting(meeting: MeetingCreate): Promise<Meeting> {
    const response = await fetch(`${API_URL}/api/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(meeting),
    });
    return handleResponse(response);
  },

  async updateMeeting(id: string, meeting: MeetingUpdate): Promise<Meeting> {
    const response = await fetch(`${API_URL}/api/meetings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(meeting),
    });
    return handleResponse(response);
  },

  async deleteMeeting(id: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/meetings/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse(response);
  },
};

// STT 관련 타입
export interface TranscriptionSegment {
  speaker: string | null;
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  transcript: string;
  audio_url: string | null;
  duration: number | null;
  segments: TranscriptionSegment[] | null;
  speaker_data: SpeakerData | null;
}

export const sttApi = {
  async transcribe(audioBlob: Blob, meetingId?: string): Promise<TranscriptionResult> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    if (meetingId) {
      formData.append('meeting_id', meetingId);
    }

    const response = await fetch(`${API_URL}/api/stt/transcribe`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
      body: formData,
    });
    return handleResponse(response);
  },

  async uploadAudio(audioBlob: Blob, meetingId: string): Promise<{ audio_url: string; message: string }> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('meeting_id', meetingId);

    const response = await fetch(`${API_URL}/api/stt/upload-audio`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
      body: formData,
    });
    return handleResponse(response);
  },
};
