"use client";

import { useEffect, useRef } from "react";

export function CursorGlow() {
  const glowRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Check if device supports hover (ignore touch devices)
    if (window.matchMedia("(pointer: coarse)").matches) return;
    
    let targetX = 0;
    let targetY = 0;
    
    const handleMouseMove = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
    };
    
    const updateGlow = () => {
      if (glowRef.current) {
        glowRef.current.style.transform = `translate(${targetX}px, ${targetY}px)`;
      }
      requestAnimationFrame(updateGlow);
    };
    
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    const animFrame = requestAnimationFrame(updateGlow);
    
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animFrame);
    };
  }, []);

  return (
    <div
      ref={glowRef}
      className="fixed inset-0 pointer-events-none z-50 w-[400px] h-[400px] -ml-[200px] -mt-[200px] rounded-full hidden sm:block will-change-transform"
      style={{
        background: "radial-gradient(circle, rgba(99,102,241,0.06) 0%, rgba(99,102,241,0) 60%)",
        mixBlendMode: "screen"
      }}
    />
  );
}
