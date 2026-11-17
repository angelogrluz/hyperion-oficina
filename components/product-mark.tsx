"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { goBack } from "@/lib/nav-history";
import { readSession } from "@/browser/src/shims/auth";
import { readCloudUser } from "@/browser/src/cloud";

export function MarkIcon({ className = "h-9 w-9", onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill={onDark ? "#16344a" : "#0e2433"} />
      <rect x="14" y="18" width="36" height="30" rx="4" fill="none" stroke="#d7eefb" strokeWidth="3" />
      <path d="M14 28h36" stroke="#d7eefb" strokeWidth="3" />
      <path d="M24 14v8M40 14v8" stroke="#7ec8ff" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 40l6 6 12-14" fill="none" stroke="#00a9fd" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ProductMark({ light = false, wordmark = true, className = "" }: { light?: boolean; wordmark?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <MarkIcon onDark={light} />
      {wordmark ? <span className={`text-[22px] font-semibold tracking-tight ${light ? "text-white" : "text-[#0e2433]"}`}>OficinaPlan</span> : null}
    </span>
  );
}

export function ProductBackButton({ light = false, onBeforeBack }: { light?: boolean; onBeforeBack?: () => boolean }) {
  const router = useRouter();
  useEffect(() => { document.title = "OficinaPlan"; }, []);
  return (
    <button
      type="button"
      data-testid="marca-logo"
      aria-label="Retroceder"
      title="OficinaPlan"
      className="block w-full cursor-pointer text-left"
      onClick={() => {
        if (onBeforeBack?.()) return;
        if (readSession()?.role === "mecanico" || readCloudUser()?.role === "tecnico") return;
        const previous = goBack();
        if (previous) router.push(previous);
      }}
    >
      <ProductMark light={light} />
    </button>
  );
}
