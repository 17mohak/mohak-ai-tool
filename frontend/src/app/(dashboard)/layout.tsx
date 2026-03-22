import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { ToastProvider } from "@/components/ui/Toast";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";
import { CursorGlow } from "@/components/ui/CursorGlow";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthenticatedLayout>
      <ToastProvider>
        <AnimatedBackground />
        <CursorGlow />
        <div className="min-h-screen flex bg-transparent text-slate-100 relative z-10">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <Header />
            <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 bg-slate-900/60 backdrop-blur-sm border-l border-t border-slate-800/50 rounded-tl-2xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] relative z-20">
              {children}
            </main>
          </div>
        </div>
        <CommandPalette />
      </ToastProvider>
    </AuthenticatedLayout>
  );
}
