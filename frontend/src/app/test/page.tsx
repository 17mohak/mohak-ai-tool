"use client";

import Link from "next/link";

export default function TestPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test Page - Data Management Access</h1>
      <Link 
        href="/admin/data" 
        className="inline-block px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-500"
      >
        Go to Data Management →
      </Link>
      
      <p className="mt-4 text-slate-400">
        If the above link works, the page exists. The sidebar issue is separate.
      </p>
    </div>
  );
}
