import { Platform } from 'react-native';
import {
  IssueCategory,
  SuggestedPriority,
  IssueAnalysisResult,
} from './issueAnalysisService';

export type ReportStatus = 'Reported' | 'Under Review' | 'Resolved';

/**
 * Payload sent to POST /api/reports
 */
export interface ReportCreatePayload {
  title: string;
  description: string;
  category: IssueCategory;
  location: string;
  suggested_priority?: SuggestedPriority;
  image_url?: string | null;
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
  suggested_priority: SuggestedPriority;
  status: ReportStatus;
  image_url?: string | null;
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
  status: ReportStatus;
  categoryIcon: string;
  imageUri?: string | null;
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

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000';
  }

  return 'http://127.0.0.1:8000';
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
 * Helper to format raw backend timestamps for mobile UI display
 */
export function formatReportDate(isoString?: string): string {
  if (!isoString) return 'Just now';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
    status: report.status,
    categoryIcon: CATEGORY_ICONS[report.category] || '📌',
    imageUri: report.image_url || null,
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

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
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
        // Fallback to response status text
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
   * Fetch all civic reports (GET /api/reports)
   */
  async getReports(category?: IssueCategory, status?: ReportStatus): Promise<BackendReportResponse[]> {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (status) params.append('status', status);

    const query = params.toString() ? `?${params.toString()}` : '';
    return apiFetch<BackendReportResponse[]>(`/api/reports${query}`);
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
};
