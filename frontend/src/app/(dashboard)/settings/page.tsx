"use client";

import { useAuth } from "@/lib/auth";

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <p className="text-slate-400 mt-0.5">
          Profile and account settings.
        </p>
      </div>

      {user && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Profile Information</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Email</label>
              <p className="text-slate-100">{user.email}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Role</label>
              <p className="text-slate-100 capitalize">{user.role.toLowerCase()}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Status</label>
              <p className="text-slate-100 capitalize">{user.status.toLowerCase()}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Member Since</label>
              <p className="text-slate-100">
                {new Date(user.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">System Information</h2>
        <div className="space-y-2 text-sm">
          <p className="text-slate-400">
            Smart Class Scheduler - Atlas Skilltech University
          </p>
          <p className="text-slate-500">
            Version 1.0.0
          </p>
        </div>
      </div>
    </div>
  );
}
