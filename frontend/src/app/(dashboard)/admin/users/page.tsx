"use client";

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/api";

interface User {
  id: number;
  email: string;
  role: string;
  status: string;
  is_active: boolean;
  created_at: string;
  approved_at?: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "pending">("all");

  useEffect(() => {
    loadUsers();
    loadPendingUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await fetchWithAuth("/api/admin/users");
      if (!response.ok) throw new Error("Failed to load users");
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error("Failed to load users:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingUsers = async () => {
    try {
      const response = await fetchWithAuth("/api/admin/users/pending");
      if (!response.ok) throw new Error("Failed to load pending users");
      const data = await response.json();
      setPendingUsers(data);
    } catch (error) {
      console.error("Failed to load pending users:", error);
    }
  };

  const handleApprove = async (userId: number) => {
    if (!confirm("Approve this user?")) return;
    try {
      const response = await fetchWithAuth(`/api/admin/users/${userId}/approve`, { method: "POST" });
      if (!response.ok) throw new Error("Failed to approve user");
      await loadUsers();
      await loadPendingUsers();
    } catch (error) {
      alert("Failed to approve user");
      console.error(error);
    }
  };

  const handleReject = async (userId: number) => {
    if (!confirm("Reject this user? This action cannot be undone.")) return;
    try {
      const response = await fetchWithAuth(`/api/admin/users/${userId}/reject`, { method: "POST" });
      if (!response.ok) throw new Error("Failed to reject user");
      await loadUsers();
      await loadPendingUsers();
    } catch (error) {
      alert("Failed to reject user");
      console.error(error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">Loading users...</p>
      </div>
    );
  }

  const displayUsers = activeTab === "all" ? users : pendingUsers;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">User Management</h1>
        <p className="text-slate-400 mt-1">Manage user accounts and approvals</p>
      </div>

      <div className="flex gap-4 border-b border-slate-700">
        <button
          onClick={() => setActiveTab("all")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "all" ? "text-indigo-400 border-b-2 border-indigo-400" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          All Users ({users.length})
        </button>
        <button
          onClick={() => setActiveTab("pending")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "pending" ? "text-indigo-400 border-b-2 border-indigo-400" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Pending Approval ({pendingUsers.length})
        </button>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700/50 border-b border-slate-700">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase">Email</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase">Role</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-400 uppercase">Created</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-slate-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {displayUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-700/30">
                  <td className="px-6 py-4 text-sm text-slate-200">{user.email}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex px-2 py-1 text-xs font-medium rounded bg-indigo-500/20 text-indigo-300">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                      user.status === "APPROVED" ? "bg-emerald-500/20 text-emerald-400"
                      : user.status === "PENDING" ? "bg-amber-500/20 text-amber-400"
                      : "bg-red-500/20 text-red-400"
                    }`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    {user.status === "PENDING" && (
                      <>
                        <button onClick={() => handleApprove(user.id)} className="px-3 py-1 text-sm font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded transition-colors">Approve</button>
                        <button onClick={() => handleReject(user.id)} className="px-3 py-1 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors">Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {displayUsers.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-400">No users found</p>
          </div>
        )}
      </div>
    </div>
  );
}
