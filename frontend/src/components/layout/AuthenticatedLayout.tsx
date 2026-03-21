"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

// Public routes that don't require authentication
const publicRoutes = ["/login", "/register"];

export function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading) {
      // If not authenticated and not on a public route, redirect to login
      if (!isAuthenticated && !publicRoutes.includes(pathname)) {
        router.push("/login");
      }
      // If authenticated and on login/register, redirect to home
      if (isAuthenticated && publicRoutes.includes(pathname)) {
        router.push("/");
      }
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Allow public routes to render without authentication
  if (!isAuthenticated && publicRoutes.includes(pathname)) {
    return <>{children}</>;
  }

  // Don't render dashboard content while redirecting
  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
