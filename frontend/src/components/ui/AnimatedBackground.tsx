"use client";

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-slate-950">
      {/* Moving gradients */}
      <div 
        className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-indigo-900/10 blur-[120px] mix-blend-screen animate-blob" 
      />
      <div 
        className="absolute top-[30%] -right-[10%] w-[60%] h-[60%] rounded-full bg-violet-900/10 blur-[150px] mix-blend-screen animate-blob animation-delay-2000" 
      />
      <div 
        className="absolute -bottom-[20%] left-[20%] w-[50%] h-[50%] rounded-full bg-blue-900/10 blur-[130px] mix-blend-screen animate-blob animation-delay-4000" 
      />
      
      {/* Subtle Noise Texture */}
      <div 
        className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
