import { useEffect, useState } from "react";
import { flushSaves, hasUnsaved, subscribeUnsaved } from "@/lib/unsaved";

const LOADED_VERSION = __APP_VERSION__;

type RemoteVersion = { id?: string };

async function reloadForVersion(version: string) {
  const saved = await flushSaves();
  if (!saved) return;
  const url = new URL(window.location.href);
  url.searchParams.set("v", version);
  window.location.replace(url.toString());
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
          if (!hasUnsaved()) {
            reloadForVersion(id);
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
    if (remote && !unsaved) reloadForVersion(remote);
  }, [remote, unsaved]);

  if (!remote || !unsaved) return null;
  return (
    <div className="fixed top-2 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#22272a] px-3 py-1.5 text-[17px] text-white shadow-lg">
      <span>Nova versão disponível –</span>
      <button type="button" className="cursor-pointer font-semibold text-[#00a9fd]" onClick={() => reloadForVersion(remote)}>
        Atualizar
      </button>
    </div>
  );
}
