type Row = { id: string; updatedAt?: string };

function stable(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

function same(left: unknown, right: unknown) {
  return stable(left) === stable(right);
}

function later<T extends Row>(local: T, remote: T) {
  const left = local.updatedAt ?? "";
  const right = remote.updatedAt ?? "";
  if (left && right && left !== right) return left > right ? local : remote;
  return remote;
}

export function mergeById<T extends Row>(base: T[] = [], local: T[] = [], remote: T[] = []) {
  const baseMap = new Map(base.map((row) => [row.id, row]));
  const localMap = new Map(local.map((row) => [row.id, row]));
  const remoteMap = new Map(remote.map((row) => [row.id, row]));
  const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
  const out: T[] = [];
  for (const id of ids) {
    const kept = pick(baseMap.get(id), localMap.get(id), remoteMap.get(id));
    if (kept) out.push(kept);
  }
  return out;
}

function pick<T extends Row>(base: T | undefined, local: T | undefined, remote: T | undefined) {
  if (!local && !remote) return undefined;
  if (!local) {
    if (!base || !same(base, remote)) return remote;
    return undefined;
  }
  if (!remote) {
    if (!base) return local;
    if (same(base, local)) return undefined;
    return local;
  }
  if (!base) return later(local, remote);
  const localChanged = !same(base, local);
  const remoteChanged = !same(base, remote);
  if (localChanged && remoteChanged) return later(local, remote);
  if (localChanged) return local;
  return remote;
}
