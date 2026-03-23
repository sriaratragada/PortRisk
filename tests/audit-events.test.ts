import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeAuditPayload,
  hashAuditPayload
} from "../lib/audit-events.ts";

test("hashAuditPayload is stable across key ordering", () => {
  const left = {
    requestId: "req-1",
    actionType: "POSITION_ADDED",
    metadata: {
      threshold: 0.3,
      controls: ["CC7.2", "CC6.1"],
      nested: { b: 2, a: 1 }
    }
  };
  const right = {
    metadata: {
      nested: { a: 1, b: 2 },
      controls: ["CC7.2", "CC6.1"],
      threshold: 0.3
    },
    actionType: "POSITION_ADDED",
    requestId: "req-1"
  };

  assert.equal(canonicalizeAuditPayload(left), canonicalizeAuditPayload(right));
  assert.equal(hashAuditPayload(left), hashAuditPayload(right));
});

test("hashAuditPayload links downstream payload hashes to prevEventHash", () => {
  const firstEvent = {
    id: "evt-1",
    actionType: "PORTFOLIO_BENCHMARK_UPDATED",
    prevEventHash: null,
    afterState: { benchmark: "QQQ" }
  };
  const firstHash = hashAuditPayload(firstEvent);

  const secondLinked = {
    id: "evt-2",
    actionType: "POSITION_ADDED",
    prevEventHash: firstHash,
    afterState: { ticker: "MSFT", shares: 10 }
  };
  const secondUnlinked = {
    ...secondLinked,
    prevEventHash: null
  };

  assert.notEqual(hashAuditPayload(secondLinked), hashAuditPayload(secondUnlinked));
});
