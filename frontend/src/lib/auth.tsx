"use client";

console.log("🔥 LIVE CODE ACTIVE 🔥");

import React, { createContext, useContext, useState, ReactNode } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type User = {
    id: number;
    email: string;
    role?: string;
};

type AuthContextType = {
    user: User | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);

    const login = async (email: string, password: string) => {
        try {
            const res = await fetch(`${API_URL}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Login failed");
            }

            const data = await res.json();

            localStorage.setItem("auth_token", data.access_token);

            const userRes = await fetch(`${API_URL}/api/auth/me`, {
                headers: {
                    Authorization: `Bearer ${data.access_token}`,
                },
            });

            const userData = await userRes.json();

            setUser(userData);
            localStorage.setItem("auth_user", JSON.stringify(userData));

        } catch (error: any) {
            console.error("[Login Error]", error);
            throw error;
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
    };

    const value: AuthContextType = {
        user,
        login,
        logout,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
