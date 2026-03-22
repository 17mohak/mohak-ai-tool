export const API_BASE = 
  process.env.NEXT_PUBLIC_API_URL || 
  (typeof window !== "undefined" 
    ? `${window.location.protocol}//${window.location.hostname}:8000` 
    : "http://localhost:8000");

/**
 * Get auth token from localStorage
 */
function getAuthToken(): string | null {
  if (typeof window !== "undefined") {
    return localStorage.getItem("auth_token");
  }
  return null;
}

/**
 * Fetch helper — points all calls at the backend API base.
 * Automatically attaches auth token if available.
 */
export async function fetchWithAuth(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  
  const token = getAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  
  try {
    return await fetch(url, { ...options, headers });
  } catch (error: any) {
    if (error.name === "TypeError") {
      throw new Error(`Network Error: Cannot connect to API backend.`);
    }
    throw error;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetchWithAuth(path, options);
  
  if (!res.ok) {
    let errorMessage: string;
    try {
      const errorData = await res.json();
      errorMessage = errorData.detail || errorData.message || JSON.stringify(errorData);
    } catch {
      errorMessage = await res.text().catch(() => res.statusText);
    }
    throw new Error(errorMessage || `HTTP ${res.status}: ${res.statusText}`);
  }
  
  const data = await res.json();
  return data as Promise<T>;
}
