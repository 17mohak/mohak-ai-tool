export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  
  // Attach auth token if available
  const token = getAuthToken();
  console.log(`[API] Token from localStorage: ${token ? token.substring(0, 20) + "..." : "NONE"}`);
  
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
    console.log(`[API] Authorization header set: Bearer ${token.substring(0, 20)}...`);
  } else if (!token) {
    console.warn(`[API] NO TOKEN AVAILABLE for request to ${path}`);
  }
  
  console.log(`[API] Request to ${url}:`, {
    method: options.method || "GET",
    hasAuth: headers.has("Authorization"),
  });
  
  return fetch(url, { ...options, headers });
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  console.log(`[API] Calling ${path}...`);
  const res = await fetchWithAuth(path, options);
  console.log(`[API] Response status for ${path}:`, res.status, res.statusText);
  
  if (!res.ok) {
    let errorMessage: string;
    try {
      const errorData = await res.json();
      errorMessage = errorData.detail || errorData.message || JSON.stringify(errorData);
    } catch {
      errorMessage = await res.text().catch(() => res.statusText);
    }
    console.error(`[API Error ${res.status}] ${path}:`, errorMessage);
    throw new Error(errorMessage || `HTTP ${res.status}: ${res.statusText}`);
  }
  
  const data = await res.json();
  console.log(`[API] Success for ${path}:`, Array.isArray(data) ? `${data.length} items` : typeof data);
  return data as Promise<T>;
}
