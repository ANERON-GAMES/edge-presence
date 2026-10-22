import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ONLINE_MS,
  PresenceState,
  chooseBase,
  foldPresence,
  shouldPersistBase
} from "../src/index.js";

test("presence states are the stable strings", () => {
  assert.equal(PresenceState.Online, "online");
  assert.equal(PresenceState.Degraded, "degraded");
  assert.equal(PresenceState.Offline, "offline");
  assert.equal(Object.isFrozen(PresenceState), true);
  assert.equal(DEFAULT_ONLINE_MS, 180000);
});

test("a preferred open path wins, and a closed path is skipped", () => {
  const chosen = chooseBase(
    [
      { id: "local", open: false, preferred: true },
      { id: "public", open: true, preferred: true },
      { id: "worker", open: true, preferred: false }
    ],
    "worker"
  );
  assert.equal(chosen, "public");
});

test("the last good path remains when every path is closed", () => {
  assert.equal(
    chooseBase(
      [
        { id: "public", open: false },
        { id: "worker", open: false }
      ],
      "kept"
    ),
    "kept"
  );
  assert.equal(chooseBase([{ id: "public", open: false }], null), null);
});

test("an open last good path wins when nothing is preferred", () => {
  const chosen = chooseBase(
    [
      { id: "public", open: true, preferred: false },
      { id: "worker", open: true, preferred: false },
      { id: "local", open: true }
    ],
    "worker"
  );
  assert.equal(chosen, "worker");
});

test("the first open path wins when the last good path is closed", () => {
  const chosen = chooseBase(
    [
      { id: "public", open: true, preferred: false },
      { id: "worker", open: false, preferred: false }
    ],
    "worker"
  );
  assert.equal(chosen, "public");
});

test("duplicate enrollments collapse to the newest heartbeat", () => {
  const now = Date.parse("2026-09-30T20:40:00.000Z");
  const rows = foldPresence(
    [
      {
        host: "node-a",
        lastSeenAt: "2026-09-30T20:39:00.000Z",
        agentLive: true,
        edgeLive: true
      },
      {
        host: "node-a",
        lastSeenAt: "2026-09-24T19:55:00.000Z",
        agentLive: false,
        edgeLive: false
      },
      {
        host: "node-a",
        lastSeenAt: "2026-09-30T20:39:30.000Z",
        retired: true,
        agentLive: false,
        edgeLive: false
      },
      {
        host: "node-b",
        lastSeenAt: "2026-09-30T20:39:00.000Z",
        retired: true,
        agentLive: true,
        edgeLive: true
      }
    ],
    now,
    180000
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].host, "node-a");
  assert.equal(rows[0].state, PresenceState.Online);
  assert.equal(rows[0].state, "online");
});

test("an equal timestamp keeps the earlier record", () => {
  const now = Date.parse("2026-09-30T20:40:00.000Z");
  const rows = foldPresence(
    [
      {
        host: "node-a",
        lastSeenAt: "2026-09-30T20:39:00.000Z",
        agentLive: true,
        edgeLive: false
      },
      {
        host: "node-a",
        lastSeenAt: "2026-09-30T20:39:00.000Z",
        agentLive: true,
        edgeLive: true
      }
    ],
    now,
    180000
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, PresenceState.Degraded);
});

test("an unparseable timestamp is skipped", () => {
  const now = Date.parse("2026-09-30T20:40:00.000Z");
  const rows = foldPresence(
    [
      { host: "node-a", lastSeenAt: "not-a-time", agentLive: true, edgeLive: true },
      {
        host: "node-b",
        lastSeenAt: "2026-09-30T20:39:30.000Z",
        agentLive: true,
        edgeLive: true
      }
    ],
    now,
    180000
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].host, "node-b");
  assert.equal(rows[0].state, PresenceState.Online);
});

test("a missing host is skipped", () => {
  const now = Date.parse("2026-09-30T20:40:00.000Z");
  const rows = foldPresence(
    [
      { lastSeenAt: "2026-09-30T20:39:30.000Z", agentLive: true, edgeLive: true },
      { host: "", lastSeenAt: "2026-09-30T20:39:30.000Z", agentLive: true, edgeLive: true },
      {
        host: "node-a",
        lastSeenAt: "2026-09-30T20:39:30.000Z",
        agentLive: true,
        edgeLive: true
      }
    ],
    now,
    180000
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].host, "node-a");
});

test("agent-only presence is degraded, and a stale pair is offline", () => {
  const now = Date.parse("2026-09-30T20:40:00.000Z");
  const rows = foldPresence(
    [
      {
        host: "node-a",
        lastSeenAt: "2026-09-30T20:39:30.000Z",
        agentLive: true,
        edgeLive: false
      },
      {
        host: "node-b",
        lastSeenAt: "2026-09-30T19:00:00.000Z",
        agentLive: true,
        edgeLive: true
      },
      {
        host: "node-c",
        lastSeenAt: "2026-09-30T20:39:30.000Z",
        agentLive: false,
        edgeLive: false
      },
      {
        host: "node-d",
        lastSeenAt: "2026-09-30T20:39:30.000Z",
        agentLive: false,
        edgeLive: true
      }
    ],
    now,
    180000
  );
  const nodeA = rows.find((row) => row.host === "node-a");
  const nodeB = rows.find((row) => row.host === "node-b");
  const nodeC = rows.find((row) => row.host === "node-c");
  const nodeD = rows.find((row) => row.host === "node-d");
  assert.equal(nodeA.state, PresenceState.Degraded);
  assert.equal(nodeA.state, "degraded");
  assert.equal(nodeA.ageMs, 30000);
  assert.equal(nodeA.lastSeenAt, "2026-09-30T20:39:30.000Z");
  assert.equal(nodeB.state, PresenceState.Offline);
  assert.equal(nodeB.state, "offline");
  assert.equal(nodeC.state, PresenceState.Offline);
  assert.equal(nodeD.state, PresenceState.Degraded);
});

test("hosts stay in first-seen order", () => {
  const now = Date.parse("2026-09-30T20:40:00.000Z");
  const rows = foldPresence(
    [
      {
        host: "node-b",
        lastSeenAt: "2026-09-30T20:39:00.000Z",
        agentLive: true,
        edgeLive: true
      },
      {
        host: "node-a",
        lastSeenAt: "2026-09-30T20:39:30.000Z",
        agentLive: true,
        edgeLive: true
      }
    ],
    now,
    180000
  );
  assert.deepEqual(
    rows.map((row) => row.host),
    ["node-b", "node-a"]
  );
});

test("the default window is inclusive", () => {
  const now = 1800000;
  const fresh = new Date(now - DEFAULT_ONLINE_MS).toISOString();
  const stale = new Date(now - DEFAULT_ONLINE_MS - 1).toISOString();
  const rows = foldPresence(
    [
      { host: "node-a", lastSeenAt: fresh, agentLive: true, edgeLive: true },
      { host: "node-b", lastSeenAt: stale, agentLive: true, edgeLive: true }
    ],
    now
  );
  const nodeA = rows.find((row) => row.host === "node-a");
  const nodeB = rows.find((row) => row.host === "node-b");
  assert.equal(nodeA.state, PresenceState.Online);
  assert.equal(nodeA.ageMs, DEFAULT_ONLINE_MS);
  assert.equal(nodeB.state, PresenceState.Offline);
  assert.equal(nodeB.ageMs, DEFAULT_ONLINE_MS + 1);
});

test("a fast local path is not stored as the permanent base", () => {
  assert.equal(shouldPersistBase({ id: "lan", kind: "local", durable: false }), false);
  assert.equal(shouldPersistBase({ id: "public", kind: "public", durable: true }), true);
  assert.equal(shouldPersistBase({ id: "public", kind: "public" }), true);
  assert.equal(shouldPersistBase({ id: "local", kind: "local" }), false);
  assert.equal(shouldPersistBase({ id: "public", kind: "public", durable: false }), false);
  assert.equal(shouldPersistBase(null), false);
});
