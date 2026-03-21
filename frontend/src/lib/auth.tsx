"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { API_BASE, fetchWithAuth, api } from "@/lib/api";

export type UserRole = "ADMIN" | "STAFF";
export type UserStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface User {
  id: number;
  email: string;
  role: UserRole;
  status: UserStatus;
  is_active: boolean;
  teacher_id: number | null;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Development mode detection
const isDevMode = process.env.NODE_ENV === "development" || 
                  process.env.NEXT_PUBLIC_SKIP_AUTH === "true";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize from localStorage on mount (or dev mode)
  useEffect(() => {
    // DEV MODE: Auto-login as admin
    if (isDevMode) {
      console.log("[Auth] Development mode detected - auto-logging in as admin");
      const devUser: User = {
        id: 1,
        email: "dev@atlas.local",
        role: "ADMIN",
        status: "APPROVED",
        is_active: true,
        teacher_id: null,
        created_at: new Date().toISOString(),
      };
      setUser(devUser);
      // Use a dummy token for dev mode
      const devToken = "dev-token";
      setToken(devToken);
      localStorage.setItem("auth_token", devToken);
      localStorage.setItem("auth_user", JSON.stringify(devUser));
      setIsLoading(false);
      return;
    }

    const storedToken = localStorage.getItem("auth_token");
    const storedUser = localStorage.getItem("auth_user");
    
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch (e) {
        // Invalid stored data, clear it
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    // DEV MODE: Skip actual login
    if (isDevMode) {
      console.log("[Login] Development mode - skipping actual login");
      const devUser: User = {
        id: 1,
        email: email || "dev@atlas.local",
        role: "ADMIN",
        status: "APPROVED",
        is_active: true,
        teacher_id: null,
        created_at: new Date().toISOString(),
      };
      setUser(devUser);
      const devToken = "dev-token";
      setToken(devToken);
      localStorage.setItem("auth_token", devToken);
      localStorage.setItem("auth_user", JSON.stringify(devUser));
      console.log("[Login] Dev mode login successful");
      return;
    }

    const loginUrl = `${API_BASE}/api/auth/login`;
    console.log(`[Login] Attempting to connect to: ${loginUrl}`);
    console.log(`[Login] Email: ${email}`);

    let response;
    try {
      response = await fetch(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      console.log(`[Login] Response received - Status: ${response.status}`);
    } catch (networkError) {
      console.error("[Login] Network error - cannot connect to server:", networkError);
      throw new Error("Cannot connect to server. Please make sure the backend is running on http://localhost:8000");
    }

    if (!response.ok) {
      let errorMessage = "Login failed";
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorData.message || JSON.stringify(errorData);
      } catch {
        errorMessage = await response.text() || `HTTP ${response.status}: ${response.statusText}`;
      }
      console.error(`[Login] Server returned error: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const accessToken = data.access_token;
    console.log("[Login] Login successful, token received");

    // Store token
    localStorage.setItem("auth_token", accessToken);
    setToken(accessToken);

    // Fetch user info using api helper (automatically includes token)
    console.log(`[Login] Fetching user info from: ${API_BASE}/api/auth/me`);
    try {
      const userData: User = await api("/api/auth/me");
    console.log(`[Login] User info received - Role: ${userData.role}, Status: ${userData.status}`);
    
    // Check if user is approved and active
    if (userData.status === "PENDING") {
      throw new Error("Your account is pending approval. Please contact an administrator.");
    }
    
    if (userData.status === "REJECTED") {
      throw new Error("Your account has been rejected. Please contact an administrator.");
    }
    
    if (!userData.is_active) {
      throw new Error("Your account is inactive.");
    }

    setUser(userData);
    localStorage.setItem("auth_user", JSON.stringify(userData));
    console.log("[Login] Login process completed successfully");
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
  };

  const refreshUser = async () => {
    // DEV MODE: Skip refresh
    if (isDevMode) {
      console.log("[Auth] Development mode - skipping user refresh");
      return;
    }

    if (!token) return;

    try {
      const userData: User = await api("/api/auth/me");
      setUser(userData);
      localStorage.setItem("auth_user", JSON.stringify(userData));
      console.log("[Auth] User refreshed successfully");
    } catch (error: any) {
      if (error.message?.includes("401")) {
        console.log("[Auth] Token expired, logging out");
        logout();
      } else {
        console.error("[Auth] Error refreshing user:", error);
      }
    }
  };

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    isAuthenticated: !!user && !!token,
    isAdmin: user?.role === "ADMIN",
    isStaff: user?.role === "STAFF",
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
