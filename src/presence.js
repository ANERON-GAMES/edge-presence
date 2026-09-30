export const DEFAULT_ONLINE_MS = 180000;

export function chooseBase(paths, lastGood) {
  const open = paths.filter((path) => path && path.open);
  if (open.length === 0) return lastGood || null;
  const preferred = open.find((path) => path.preferred);
  if (preferred) return preferred.id;
  if (lastGood && open.some((path) => path.id === lastGood)) return lastGood;
  return open[0].id;
}

export function foldPresence(nodes, nowMs, onlineMs) {
  const windowMs = onlineMs == null ? DEFAULT_ONLINE_MS : onlineMs;
  const byHost = new Map();
  for (const node of nodes) {
    if (!node || !node.host || node.retired) continue;
    const seen = Date.parse(node.lastSeenAt);
    if (!Number.isFinite(seen)) continue;
    const current = byHost.get(node.host);
    if (!current || seen > Date.parse(current.lastSeenAt)) byHost.set(node.host, node);
  }
  return Array.from(byHost.values()).map((node) => {
    const age = nowMs - Date.parse(node.lastSeenAt);
    let state = "offline";
    if (age <= windowMs && node.agentLive && node.edgeLive) state = "online";
    else if (age <= windowMs && (node.agentLive || node.edgeLive)) state = "degraded";
    return {
      host: node.host,
      state,
      ageMs: age,
      lastSeenAt: node.lastSeenAt
    };
  });
}

export function shouldPersistBase(candidate) {
  if (!candidate) return false;
  if (candidate.durable === false) return false;
  return candidate.kind === "public";
}
