# edge-presence

Fold heartbeats from several paths into one presence, without letting the fast path become the only path.

A machine that can be reached through a public address, a worker address, and a local address should use the open preferred path. When every path is closed, it should keep the last good path. It should not save a temporary local address as its permanent base, because that address disappears the moment the machine leaves the building.

```js
import { chooseBase, foldPresence, shouldPersistBase } from "./src/index.js";

const base = chooseBase([
  { id: "public", open: true, preferred: true },
  { id: "worker", open: true },
  { id: "lan", open: false }
], "worker");

const presence = foldPresence([
  { host: "desk", lastSeenAt: new Date().toISOString(), agentLive: true, edgeLive: false }
], Date.now(), 180000);
```

Two enrollments of the same host collapse to the newest heartbeat. A retired host is omitted. Both channels fresh means online. One channel fresh means degraded. Older than the window means offline.

`shouldPersistBase` accepts a public durable path and rejects a local one.

```
node --test
```

MIT. Vadim Gubin.
