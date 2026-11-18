import { useEffect, useState } from "react";
import { flushSaves, hasUnsaved, subscribeUnsaved } from "@/lib/unsaved";

const LOADED_VERSION = __APP_VERSION__;
const RELOAD_KEY = "oficinaplan-reload";
const RELOAD_WINDOW_MS = 10 * 60 * 1000;

type RemoteVersion = { id?: string };
type ReloadAttempt = { version: string; at: number; count: number };

function readAttempt(): ReloadAttempt | null {
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReloadAttempt;
    if (!parsed?.version || typeof parsed.at !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function triedRecently(version: string) {
  const attempt = readAttempt();
  if (!attempt || attempt.version !== version || attempt.count < 1) return false;
  return Date.now() - attempt.at < RELOAD_WINDOW_MS;
}

function markTried(version: string) {
  const previous = readAttempt();
  const same = previous?.version === version && Date.now() - previous.at < RELOAD_WINDOW_MS;
  sessionStorage.setItem(RELOAD_KEY, JSON.stringify({
    version,
    at: Date.now(),
    count: same && previous ? previous.count + 1 : 1,
  }));
}

async function reloadForVersion(version: string, manual = false) {
  if (!manual && triedRecently(version)) return false;
  const saved = await flushSaves();
  if (!saved) return false;
  markTried(version);
  const url = new URL(window.location.href);
  url.searchParams.delete("r");
  url.searchParams.set("v", version);
  window.location.replace(url.toString());
  return true;
}

async function fetchRemoteVersion() {
  const url = new URL(`${import.meta.env.BASE_URL}version.json`, window.location.origin);
  url.searchParams.set("t", String(Date.now()));
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  if (!response.ok) return null;
  const body = (await response.json()) as RemoteVersion;
  return body.id ?? null;
}

export function AppUpdates() {
  const [remote, setRemote] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState(hasUnsaved);

  useEffect(() => subscribeUnsaved(() => setUnsaved(hasUnsaved())), []);

  useEffect(() => {
    let stopped = false;
    const check = () => {
      void fetchRemoteVersion()
        .then((id) => {
          if (stopped || !id || id === LOADED_VERSION) {
            if (!stopped && id === LOADED_VERSION) setRemote(null);
            return;
          }
          if (!hasUnsaved() && !triedRecently(id)) {
            void reloadForVersion(id);
            return;
          }
          setRemote(id);
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(check, 60_000);
    const onFocus = () => check();
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    check();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (remote && !unsaved && !triedRecently(remote)) void reloadForVersion(remote);
  }, [remote, unsaved]);

  if (!remote || (!unsaved && !triedRecently(remote))) return null;
  return (
    <div className="fixed top-2 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--charcoal)] px-3 py-1.5 text-[17px] text-white shadow-lg">
      <span>Nova versão disponível –</span>
      <button type="button" className="cursor-pointer font-semibold text-[var(--glow)]" onClick={() => reloadForVersion(remote, true)}>
        Atualizar
      </button>
    </div>
  );
}
