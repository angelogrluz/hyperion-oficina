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
