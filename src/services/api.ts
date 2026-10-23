import { Platform } from 'react-native';
import {
  IssueCategory,
  SuggestedPriority,
  IssueAnalysisResult,
} from './issueAnalysisService';
import { authStorage } from './authStorage';

export type ReportStatus = 'Reported' | 'Under Review' | 'In Progress' | 'Resolved' | 'Rejected';

export type UserRole = 'Citizen' | 'Ward Officer';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  ward: string;
  created_at?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
}

/**
 * Payload sent to POST /api/reports
 */
export interface ReportCreatePayload {
  title: string;
  description: string;
  category: IssueCategory;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  ward?: string;
  suggested_priority?: SuggestedPriority;
  image_url?: string | null;
  user_id?: string | null;
}

/**
 * Response schema returned by GET /api/reports and POST /api/reports
 */
export interface BackendReportResponse {
  id: string; // e.g. "CL-1001"
  title: string;
  description: string;
  category: IssueCategory;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  ward?: string;
  suggested_priority: SuggestedPriority;
  status: ReportStatus;
  upvotes?: number;
  image_url?: string | null;
  user_id?: string | null;
  created_at: string;
  updated_at: string;
  is_mock_persistence?: boolean;
}

/**
 * Health check response from GET /health
 */
export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  persistence_mode: string;
}

/**
 * Frontend app issue representation that seamlessly links backend records
 * with local UI decorations (such as icons and mock AI analysis snapshots).
 */
export interface IssueReportItem {
  id: string;
  referenceNo: string;
  title: string;
  category: IssueCategory;
  description: string;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  ward?: string;
  status: ReportStatus;
  upvotes?: number;
  categoryIcon: string;
  imageUri?: string | null;
  user_id?: string | null;
  createdAt: string;
  suggestedPriority?: SuggestedPriority;
  aiAnalysis?: IssueAnalysisResult | null;
  isBackendSynced?: boolean;
}

export const CATEGORY_ICONS: Record<IssueCategory, string> = {
  'Road Damage': '🚧',
  Garbage: '🗑️',
  'Broken Streetlight': '💡',
  Waterlogging: '🌊',
  'Water Supply': '🚰',
  Other: '📌',
};

/**
 * Resolves the default backend base URL based on runtime platform:
 * - Android Emulator: 10.0.2.2 points to host loopback (where FastAPI runs on port 8000)
 * - iOS Simulator / Web / Desktop: 127.0.0.1:8000
 * - Overridden at compile/run time by EXPO_PUBLIC_API_URL
 */
export function getDefaultApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // Fallback LAN IP for your physical phone / Expo Go
  // (Change to http://10.0.2.2:8000 if testing strictly on Android Emulator)
  return 'http://172.16.36.247:8000';
}

export const API_BASE_URL = getDefaultApiBaseUrl();

/**
 * Custom error class capturing endpoint and network detail
 */
export class ApiError extends Error {
  status?: number;
  isNetworkError: boolean;

  constructor(message: string, status?: number, isNetworkError: boolean = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isNetworkError = isNetworkError;
  }
}

/**
 * Robust helper to format raw backend timestamps for mobile UI display.
 * Properly formats both date and time (e.g. "Today, 02:30 PM", "Yesterday, 04:15 PM", "Oct 23, 2026 • 02:30 PM").
 */
export function formatReportDate(isoString?: string): string {
  if (!isoString) return 'Just now';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;

    const now = new Date();
    const isToday = now.getFullYear() === year && now.getMonth() === d.getMonth() && now.getDate() === day;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = yesterday.getFullYear() === year && yesterday.getMonth() === d.getMonth() && yesterday.getDate() === day;

    if (isToday) {
      return `Today, ${timeStr}`;
    }
    if (isYesterday) {
      return `Yesterday, ${timeStr}`;
    }
    return `${month} ${day}, ${year} • ${timeStr}`;
  } catch {
    return isoString;
  }
}

/**
 * Converts a backend response into the frontend item model
 */
export function transformBackendReport(report: BackendReportResponse): IssueReportItem {
  return {
    id: report.id,
    referenceNo: report.id,
    title: report.title,
    category: report.category,
    description: report.description,
    location: report.location,
    latitude: report.latitude ?? null,
    longitude: report.longitude ?? null,
    ward: report.ward || 'Downtown Ward 14',
    status: report.status,
    upvotes: report.upvotes ?? 0,
    categoryIcon: CATEGORY_ICONS[report.category] || '📌',
    imageUri: report.image_url || null,
    user_id: report.user_id || null,
    createdAt: formatReportDate(report.created_at),
    suggestedPriority: report.suggested_priority,
    aiAnalysis: null,
    isBackendSynced: true,
  };
}

/**
 * Robust fetch wrapper with timeout and descriptive error handling
 */
async function apiFetch<T>(endpoint: string, options: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const token = await authStorage.getToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers,
    });

    clearTimeout(timer);

    if (!response.ok) {
      let errorMessage = `Server error (${response.status})`;
      try {
        const errorBody = await response.json();
        if (errorBody && errorBody.detail) {
          if (typeof errorBody.detail === 'string') {
            errorMessage = errorBody.detail;
          } else if (Array.isArray(errorBody.detail)) {
            errorMessage = errorBody.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
          }
        }
      } catch {
        if (response.statusText) {
          errorMessage = `${response.statusText} (${response.status})`;
        }
      }
      throw new ApiError(errorMessage, response.status, false);
    }

    return (await response.json()) as T;
  } catch (error: any) {
    clearTimeout(timer);

    if (error instanceof ApiError) {
      throw error;
    }

    const isAbort = error.name === 'AbortError';
    const message = isAbort
      ? `Request timed out connecting to backend at ${API_BASE_URL}. Ensure FastAPI is running and reachable.`
      : `Cannot reach CivicLens backend at ${API_BASE_URL}. Ensure FastAPI is running (on 10.0.2.2:8000 for Android emulator or your LAN IP for physical device).`;

    throw new ApiError(message, undefined, true);
  }
}

/**
 * Centralized API client methods
 */
export const apiClient = {
  /**
   * Health check
   */
  async checkHealth(): Promise<HealthResponse> {
    return apiFetch<HealthResponse>('/health');
  },

  /**
   * Register a new user
   */
  async register(payload: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    ward?: string;
  }): Promise<AuthResponse> {
    const data = await apiFetch<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (data.access_token) {
      await authStorage.saveAuth(data.access_token, data.user);
    }
    return data;
  },

  /**
   * Log in with credentials
   */
  async login(payload: { email: string; password: string }): Promise<AuthResponse> {
    const data = await apiFetch<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (data.access_token) {
      await authStorage.saveAuth(data.access_token, data.user);
    }
    return data;
  },

  /**
   * Fetch current authenticated user
   */
  async getMe(): Promise<UserProfile> {
    return apiFetch<UserProfile>('/api/auth/me');
  },

  /**
   * Fetch all civic reports (GET /api/reports)
   */
  async getReports(
    category?: IssueCategory,
    status?: ReportStatus,
    userId?: string,
    ward?: string
  ): Promise<BackendReportResponse[]> {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (status) params.append('status', status);
    if (userId) params.append('user_id', userId);
    if (ward) params.append('ward', ward);

    const query = params.toString() ? `?${params.toString()}` : '';
    return apiFetch<BackendReportResponse[]>(`/api/reports${query}`);
  },

  /**
   * Fetch only reports submitted by authenticated user
   */
  async getMyReports(): Promise<BackendReportResponse[]> {
    return apiFetch<BackendReportResponse[]>('/api/reports/my');
  },

  /**
   * Fetch a single report by ID (GET /api/reports/{report_id})
   */
  async getReportById(reportId: string): Promise<BackendReportResponse> {
    return apiFetch<BackendReportResponse>(`/api/reports/${encodeURIComponent(reportId)}`);
  },

  /**
   * Create a new civic report (POST /api/reports)
   */
  async createReport(payload: ReportCreatePayload): Promise<BackendReportResponse> {
    return apiFetch<BackendReportResponse>('/api/reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Update report status (PATCH /api/reports/{report_id}/status)
   */
  async updateReportStatus(reportId: string, newStatus: ReportStatus): Promise<BackendReportResponse> {
    return apiFetch<BackendReportResponse>(`/api/reports/${encodeURIComponent(reportId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
  },

  /**
   * Highlight / upvote an existing report (PATCH /api/reports/{report_id}/upvote)
   */
  async upvoteReport(reportId: string): Promise<BackendReportResponse> {
    return apiFetch<BackendReportResponse>(`/api/reports/${encodeURIComponent(reportId)}/upvote`, {
      method: 'PATCH',
    });
  },

  /**
   * Log out and purge storage
   */
  async logout(): Promise<void> {
    await authStorage.clearAuth();
  },
};
