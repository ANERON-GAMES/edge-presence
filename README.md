# edge-presence

Fold heartbeats from several paths into one presence, without letting a fast path become the only path.

A caller can reach one machine on more than one path. One path may be the preferred path. Another may be open only for a moment. This module picks which path id to keep, folds many heartbeats into one row per host, and decides whether that path is safe to store as the permanent base.

The transport stays outside the module. Pass the paths and the heartbeats you already collected.

## Install

The package is an ES module. It needs Node.js 20 or newer. It has no runtime dependencies. The package name is `@aneron/edge-presence`. It is not published to the npm registry.

Clone this repository and run the tests:

```bash
git clone https://github.com/ANERON-GAMES/edge-presence.git
cd edge-presence
npm install
npm test
```

`npm test` runs `node --test`. `npm run lint` runs ESLint. `npm run format:check` runs Prettier.

Install it as a dependency from the git repository:

```bash
npm install github:ANERON-GAMES/edge-presence
```

```js
import {
  DEFAULT_ONLINE_MS,
  PresenceState,
  chooseBase,
  foldPresence,
  shouldPersistBase
} from "@aneron/edge-presence";
```

Code in this repository imports the same entry point with `./src/index.js`.

## Usage

`chooseBase` returns a path id. `foldPresence` returns one row per host. `shouldPersistBase` returns a boolean. `nowMs` is the caller's clock.

```js
import { PresenceState, chooseBase, foldPresence, shouldPersistBase } from "@aneron/edge-presence";

const base = chooseBase(
  [
    { id: "public", open: true, preferred: true, kind: "public" },
    { id: "worker", open: true, kind: "public" },
    { id: "local", open: false, kind: "local", durable: false }
  ],
  "worker"
);
// base === "public"

const kept = chooseBase(
  [
    { id: "public", open: true },
    { id: "worker", open: true },
    { id: "local", open: true }
  ],
  "worker"
);
// kept === "worker"

const now = Date.parse("2026-09-30T20:40:00.000Z");
const presence = foldPresence(
  [
    {
      host: "node-a",
      lastSeenAt: "2026-09-30T20:39:30.000Z",
      agentLive: true,
      edgeLive: false
    },
    {
      host: "node-a",
      lastSeenAt: "2026-09-30T20:39:00.000Z",
      agentLive: false,
      edgeLive: false
    },
    {
      host: "node-b",
      lastSeenAt: "2026-09-30T19:00:00.000Z",
      agentLive: true,
      edgeLive: true
    }
  ],
  now,
  180000
);
// presence[0].host === "node-a"
// presence[0].state === PresenceState.Degraded
// presence[0].state === "degraded"
// presence[1].host === "node-b"
// presence[1].state === PresenceState.Offline

const stored = shouldPersistBase({ id: "public", kind: "public" });
// stored === true

const temporary = shouldPersistBase({ id: "local", kind: "local", durable: false });
// temporary === false
```

`base` is the open preferred path. `kept` is the previous id, because it is still open and no open path is preferred. The earlier open path does not replace it. `node-a` collapses to the newer heartbeat. One live channel inside the window is degraded. `node-b` is older than the window, so it is offline. A public path with `durable` omitted is stored. A local path marked `durable: false` is not.

## API reference

All functions are pure. They do not read the clock, the network, or the filesystem. They do not mutate their arguments. The caller passes `nowMs`.

### Constants

| Export              | Value    | Meaning                                                                        |
| ------------------- | -------- | ------------------------------------------------------------------------------ |
| `DEFAULT_ONLINE_MS` | `180000` | The fresh window `foldPresence` uses when `onlineMs` is `null` or `undefined`. |

### `PresenceState`

Frozen. The fields and the strings are the same values. `foldPresence` sets `state` to one of these strings.

| Field      | Value        | When                                                                                   |
| ---------- | ------------ | -------------------------------------------------------------------------------------- |
| `Online`   | `"online"`   | `ageMs` is within the window, and both `agentLive` and `edgeLive` are truthy.          |
| `Degraded` | `"degraded"` | `ageMs` is within the window, and exactly one of `agentLive` and `edgeLive` is truthy. |
| `Offline`  | `"offline"`  | `ageMs` is outside the window, or both channels are falsy.                             |

### Path

`chooseBase` reads `id`, `open`, and `preferred`. `shouldPersistBase` reads `kind` and `durable`. Any other field is ignored.

| Field       | Type | Role                                                                                                           |
| ----------- | ---- | -------------------------------------------------------------------------------------------------------------- |
| `id`        | any  | The value `chooseBase` returns when this path is chosen. Compared with `lastGood` using `===`.                 |
| `open`      | any  | A truthy value means the path can be chosen. A falsy value means the path is closed and is ignored.            |
| `preferred` | any  | A truthy value, among open paths, wins. The first preferred open path in input order is chosen.                |
| `kind`      | any  | `shouldPersistBase` returns true only when this is strictly `"public"` and `durable` is not strictly `false`.  |
| `durable`   | any  | Strict `false` refuses persistence. An omitted value, `true`, and any other value do not refuse by themselves. |

### Node

`foldPresence` reads these fields. Any other field is ignored and is not copied onto the result.

| Field        | Type | Role                                                                                                            |
| ------------ | ---- | --------------------------------------------------------------------------------------------------------------- |
| `host`       | any  | The identity of the row. A falsy host is skipped. Duplicate hosts collapse to the newest finite heartbeat.      |
| `lastSeenAt` | any  | Passed to `Date.parse`. A non-finite result skips the node. The winning value is copied onto the row unchanged. |
| `agentLive`  | any  | A truthy value means the agent channel counts as up.                                                            |
| `edgeLive`   | any  | A truthy value means the edge channel counts as up.                                                             |
| `retired`    | any  | A truthy value skips the node. A retired node does not create a row and does not replace one.                   |

### Result row

| Field        | Type   | Meaning                                                                       |
| ------------ | ------ | ----------------------------------------------------------------------------- |
| `host`       | any    | `host` from the winning node.                                                 |
| `state`      | string | `PresenceState.Online`, `PresenceState.Degraded`, or `PresenceState.Offline`. |
| `ageMs`      | number | `nowMs` minus the parsed `lastSeenAt` of the winning node. It is not clamped. |
| `lastSeenAt` | any    | The winning node's `lastSeenAt`, unchanged.                                   |

### `chooseBase(paths, lastGood)`

Choose one path id.

| Argument   | Type  | Role                                                    |
| ---------- | ----- | ------------------------------------------------------- |
| `paths`    | array | Path objects, in the order the caller wants considered. |
| `lastGood` | any   | The id to keep when the rules below select it.          |

The return value is a path `id`, or `null` when every path is closed and `lastGood` is falsy. `lastGood` is returned as given when it is selected. It is not required to be a string, and it does not have to appear in `paths`.

The checks run in this order. The first match wins.

1. Keep entries that are truthy and have a truthy `open`. Closed paths drop out here, including a closed path with `preferred` set. The remaining order is the input order.
2. If none remain, return `lastGood` when it is truthy, otherwise `null`. The id is kept even when it is not in the list.
3. If any remaining path has a truthy `preferred`, return that path's `id`. When several open paths are preferred, the earlier one wins.
4. If `lastGood` is truthy and an open path has `id === lastGood`, return `lastGood`. An open last-good id wins over list order when nothing is preferred.
5. Return the `id` of the first open path. Input order decides.

`paths` must be an array. The function does not sort the paths.

### `foldPresence(nodes, nowMs, onlineMs)`

Fold heartbeats into one row per host.

| Argument   | Type   | Role                                                                                                       |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| `nodes`    | array  | Heartbeat records, in caller order.                                                                        |
| `nowMs`    | number | Subtracted from each winning timestamp. It is not validated.                                               |
| `onlineMs` | number | The fresh window in milliseconds. `null` and `undefined` select `DEFAULT_ONLINE_MS`. `0` is a real window. |

The return value is an array of result rows. Order is the order in which each host was first inserted. The rows are not sorted. A later, newer heartbeat for a host replaces the stored record and leaves that host where it was first seen.

The walk is:

1. The window is `onlineMs` when `onlineMs == null` is false. Otherwise the window is `DEFAULT_ONLINE_MS`. Only `null` and `undefined` select the default.
2. Skip a falsy node, a falsy `host`, and a truthy `retired`. An empty string host is skipped.
3. Skip the node when `Date.parse(lastSeenAt)` is not finite. A missing `lastSeenAt`, an empty string, and a non-date string are skipped. Pass an ISO-8601 date string. `Date.parse` of other strings is defined by the host engine, and this module does not add a parser.
4. If the host is new, store the node. If the host is already stored, replace it only when the new parsed time is strictly greater. An equal timestamp keeps the earlier record.
5. Emit one row per stored host.

`ageMs` is `nowMs` minus the parsed timestamp of the winning node. A timestamp after `nowMs` produces a negative age. The age is not clamped, and a negative age is within the window.

The state checks run in this order:

1. `ageMs <= window` and both `agentLive` and `edgeLive` are truthy. The state is `"online"`.
2. `ageMs <= window` and at least one of those two is truthy. The state is `"degraded"`.
3. Anything else. The state is `"offline"`.

The window is inclusive. An age equal to the window is still fresh. An age greater than the window is offline, including when both channels are truthy. Both channels falsy is offline even when the timestamp is fresh.

A retired copy of a host does not replace a live row, even when its timestamp is newer. A node with no host does not create a row.

`nodes` must be iterable.

### `shouldPersistBase(candidate)`

Decide whether a path may be stored as the permanent base.

| Argument    | Type   | Role                                   |
| ----------- | ------ | -------------------------------------- |
| `candidate` | object | A path. A falsy value returns `false`. |

The checks run in this order:

1. A falsy candidate returns `false`.
2. `durable === false` returns `false`, for every `kind`.
3. Return whether `kind === "public"`.

`kind: "public"` with `durable` omitted returns `true`. `kind: "public"` with `durable: true` returns `true`. Any other `kind` returns `false`, including when `durable` is omitted or `true`. Extra fields are ignored.

`chooseBase` can still return a local id when that path is the open choice. Call `shouldPersistBase` before writing the id into permanent storage.

## Behavior and limits

- If every path is closed, the last good id is kept, even when it is not in the list. A falsy last good becomes `null`.
- If several paths are open and none is preferred, an open last-good id wins over list order.
- Otherwise the first open path wins, so input order matters. A closed last-good id does not win.
- `foldPresence` skips a missing host, a retired node, and an unparseable `lastSeenAt`.
- Duplicate hosts collapse to the newest heartbeat. An equal parsed timestamp keeps the earlier record.
- Output order is map insertion order, not a sort.
- `shouldPersistBase` returns `true` for `kind: "public"` when `durable` is omitted, and `false` when `durable` is `false` or `kind` is anything else.
- `open`, `preferred`, `host`, `retired`, `agentLive`, and `edgeLive` use truthiness. `durable` and `kind` use strict equality.
- The fresh check uses `<=`. The boundary millisecond is still fresh.
- `onlineMs` of `0` is a real window. Only `null` and `undefined` select `DEFAULT_ONLINE_MS`.
- A future `lastSeenAt` yields a negative `ageMs` and can be online or degraded. The module does not reject it.
- No sockets, no timers, no stored base, and no mutation of the objects passed in.

## Design notes

The preferred open path is the base so a faster open path cannot replace the one the caller marked. Preference is only considered among paths that are open. A preferred path that is closed is not a choice.

When nothing open is preferred, the previous id stays if it is still open. An extra path listed earlier must not take the base away from an id that is still usable. When the previous id is closed, or was never open in this list, the first open path wins. The caller controls that order.

When every path is closed, the previous id is kept even if this call did not include it. A total close is not a reason to forget the base. Returning `null` there would make the next choice depend on whichever path opens first. A falsy previous id is the one case that returns `null`, because there is nothing to keep.

Persistence is a separate question from selection. `chooseBase` may return a local id because it is the only open path. That id is a poor permanent base: it belongs to a path that is not public, or the caller has marked it `durable: false`. `shouldPersistBase` refuses both. A public path is stored when `durable` is omitted. The caller opts out with strict `false`, rather than having to remember to opt in.

`foldPresence` keeps the newest heartbeat for a host so an older enrollment cannot paint the host offline after a newer one has arrived. An equal timestamp keeps the first record, so a duplicate with the same time does not change the channels. A retired node is omitted rather than shown as offline. A withdrawn host is not the same fact as a stale one. An unparseable timestamp is omitted for the same reason: an offline row with a meaningless age would look like a real host.

Rows stay in first-seen order. Sorting by host or by age would change the list as timestamps move, and it would hide the order the caller already chose. The caller can sort the array if a display needs a different order.

This module does not open a socket, schedule a timer, store the chosen base, or name a network. Identity, transport, and persistence stay with the caller.

## Compatibility

Version 1.0.0 keeps `chooseBase`, `foldPresence`, and `shouldPersistBase`, their argument order, the state strings `"online"`, `"degraded"`, and `"offline"`, and the default window of `180000`.

`PresenceState` is a new export. Compare a result with the string or with the field. They are the same value.

The package metadata no longer sets `private`. For every input the previous functions accepted, the returned ids, rows, and booleans are unchanged.

## License

Released under the MIT License. Copyright (c) 2026 Vadim Gubin. The full text is in [LICENSE](LICENSE).
