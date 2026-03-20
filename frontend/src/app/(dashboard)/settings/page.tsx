"use client";

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <p className="text-slate-400 mt-0.5">
          System configuration and preferences.
        </p>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <p className="text-slate-400 text-sm">
          Settings and profile management will be available in a future release.
        </p>
      </div>
    </div>
  );
}
