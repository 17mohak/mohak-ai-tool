"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const { login } = useAuth();
  const router = useRouter();

  const testConnection = async () => {
    setIsTestingConnection(true);
    setConnectionStatus(null);
    setError("");
    
    const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const healthUrl = `${backendUrl}/health`;
    
    console.log(`[Test Connection] Testing backend at: ${healthUrl}`);
    
    try {
      const response = await fetch(healthUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log("[Test Connection] Backend is reachable:", data);
        setConnectionStatus("✅ Backend is reachable! You can now try logging in.");
      } else {
        console.error(`[Test Connection] Backend returned status: ${response.status}`);
        setConnectionStatus(`⚠️ Backend returned error: ${response.status}`);
      }
    } catch (err) {
      console.error("[Test Connection] Cannot connect to backend:", err);
      setError(`Cannot connect to backend at ${backendUrl}. Please make sure the backend server is running.`);
      setConnectionStatus("❌ Cannot connect to backend. Make sure it's running on http://localhost:8000");
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await login(email, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-2xl font-bold text-white">A</span>
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-slate-400">
            Smart Class Scheduler - Atlas Skilltech University
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-900/50 p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-200">{error}</h3>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-slate-600 placeholder-slate-500 text-white bg-slate-800 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-slate-600 placeholder-slate-500 text-white bg-slate-800 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </div>

          {connectionStatus && (
            <div className={`rounded-md p-3 text-sm ${connectionStatus.includes("✅") ? "bg-green-900/50 text-green-200" : connectionStatus.includes("❌") ? "bg-red-900/50 text-red-200" : "bg-yellow-900/50 text-yellow-200"}`}>
              {connectionStatus}
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={testConnection}
              disabled={isTestingConnection}
              className="group relative w-full flex justify-center py-2 px-4 border border-slate-600 text-sm font-medium rounded-md text-slate-300 bg-slate-800 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTestingConnection ? "Testing..." : "Test Connection to Backend"}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm">
              <Link
                href="/register"
                className="font-medium text-blue-400 hover:text-blue-300"
              >
                Create an account
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
