const unsaved = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function markUnsaved(id: string, dirty: boolean) {
  const before = unsaved.size;
  if (dirty) unsaved.add(id);
  else unsaved.delete(id);
  if (unsaved.size !== before) emit();
}

export function hasUnsaved() {
  return unsaved.size > 0;
}

export function subscribeUnsaved(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const flushes = new Set<() => Promise<boolean>>();

export function registerSaveFlush(fn: () => Promise<boolean>) {
  flushes.add(fn);
  return () => {
    flushes.delete(fn);
  };
}

export async function flushSaves() {
  const results = await Promise.all([...flushes].map((fn) => fn().catch(() => false)));
  return results.every(Boolean);
}
