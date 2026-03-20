"use client";

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/api";

interface Insight {
  title: string;
  description: string;
  severity: "CRITICAL" | "WARNING" | "RECOMMENDATION";
  category: string;
  suggested_action: string;
  impact: string;
}

export default function AIInsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => { loadInsights(); }, []);

  const loadInsights = async () => {
    try {
      const response = await fetchWithAuth("/api/ai/insights");
      if (!response.ok) throw new Error("Failed to load insights");
      const data = await response.json();
      setInsights(data);
    } catch (error) {
      console.error("Failed to load insights:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const response = await fetchWithAuth("/api/ai/insights/generate", { method: "POST" });
      if (!response.ok) throw new Error("Failed to generate insights");
      await loadInsights();
    } catch (error) {
      alert("Failed to generate insights");
      console.error(error);
    } finally {
      setGenerating(false);
    }
  };

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case "CRITICAL": return "border-red-500/30 bg-red-500/5";
      case "WARNING": return "border-amber-500/30 bg-amber-500/5";
      case "RECOMMENDATION": return "border-indigo-500/30 bg-indigo-500/5";
      default: return "border-slate-700 bg-slate-800";
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "CRITICAL": return "bg-red-500/20 text-red-400";
      case "WARNING": return "bg-amber-500/20 text-amber-400";
      case "RECOMMENDATION": return "bg-indigo-500/20 text-indigo-400";
      default: return "bg-slate-700 text-slate-400";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">Loading insights...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">AI Insights</h1>
          <p className="text-slate-400 mt-1">Proactive analysis and recommendations</p>
        </div>
        <button onClick={handleGenerate} disabled={generating}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed">
          {generating ? "Generating..." : "Regenerate Insights"}
        </button>
      </div>

      <div className="grid gap-4">
        {insights.map((insight, index) => (
          <div key={index} className={`rounded-xl border p-6 ${getSeverityStyle(insight.severity)}`}>
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold text-slate-100">{insight.title}</h3>
                  <div className="flex gap-2 ml-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${getSeverityBadge(insight.severity)}`}>{insight.severity}</span>
                    <span className="px-2 py-1 text-xs font-medium rounded bg-slate-700 text-slate-400">{insight.category}</span>
                  </div>
                </div>
                <p className="text-slate-300 mb-4">{insight.description}</p>
                <div className="bg-slate-800/50 rounded-lg p-4 mb-3 border border-slate-700/50">
                  <p className="text-xs font-medium text-slate-500 uppercase mb-1">Suggested Action</p>
                  <p className="text-slate-200">{insight.suggested_action}</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm font-medium text-slate-500">Expected Impact:</span>
                  <p className="text-sm text-slate-300">{insight.impact}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
        {insights.length === 0 && (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
            <p className="text-slate-400">No insights available. Click &quot;Regenerate Insights&quot; to analyze system data.</p>
          </div>
        )}
      </div>
    </div>
  );
}
