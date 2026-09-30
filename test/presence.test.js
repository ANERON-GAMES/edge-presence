import assert from "node:assert/strict";
import test from "node:test";
import { chooseBase, foldPresence, shouldPersistBase } from "../src/index.js";

test("a preferred open path wins, and a closed path is skipped", () => {
  const chosen = chooseBase([
    { id: "public", open: true, preferred: true },
    { id: "worker", open: true, preferred: false },
    { id: "lan", open: false, preferred: false }
  ], "worker");
  assert.equal(chosen, "public");
});

test("the last good path remains when every path is closed", () => {
  assert.equal(chooseBase([
    { id: "public", open: false },
    { id: "worker", open: false }
  ], "worker"), "worker");
});

test("duplicate enrollments collapse to the newest heartbeat", () => {
  const now = Date.parse("2026-09-30T20:40:00.000Z");
  const rows = foldPresence([
    { host: "lab-a", lastSeenAt: "2026-09-30T20:39:00.000Z", agentLive: true, edgeLive: true },
    { host: "lab-a", lastSeenAt: "2026-09-24T19:55:00.000Z", agentLive: false, edgeLive: false },
    { host: "old-lab", lastSeenAt: "2026-09-30T20:39:00.000Z", retired: true, agentLive: true, edgeLive: true }
  ], now, 180000);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].host, "lab-a");
  assert.equal(rows[0].state, "online");
});

test("agent-only presence is degraded, and a stale pair is offline", () => {
  const now = Date.parse("2026-09-30T20:40:00.000Z");
  const rows = foldPresence([
    { host: "desk", lastSeenAt: "2026-09-30T20:39:30.000Z", agentLive: true, edgeLive: false },
    { host: "cabin", lastSeenAt: "2026-09-30T19:00:00.000Z", agentLive: true, edgeLive: true }
  ], now, 180000);
  const desk = rows.find((row) => row.host === "desk");
  const cabin = rows.find((row) => row.host === "cabin");
  assert.equal(desk.state, "degraded");
  assert.equal(cabin.state, "offline");
});

test("a fast local path is not stored as the permanent base", () => {
  assert.equal(shouldPersistBase({ id: "lan", kind: "local", durable: false }), false);
  assert.equal(shouldPersistBase({ id: "public", kind: "public", durable: true }), true);
});
