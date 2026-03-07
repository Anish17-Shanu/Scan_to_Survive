import assert from "node:assert/strict";
import test from "node:test";
import { buildGameplayMeta, buildMilestoneBadge, computeProgressPercent } from "../src/utils/gameplayUtils.js";

test("buildGameplayMeta returns consistent totals", () => {
  const meta = buildGameplayMeta(8, 5, 300);
  assert.equal(meta.main_steps, 8);
  assert.equal(meta.rapid_fire_questions, 5);
  assert.equal(meta.rapid_fire_duration_seconds, 300);
  assert.equal(meta.total_steps, 13);
});

test("computeProgressPercent clamps between 0 and 100", () => {
  assert.equal(computeProgressPercent(-4, 10), 0);
  assert.equal(computeProgressPercent(5, 10), 50);
  assert.equal(computeProgressPercent(40, 10), 100);
});

test("buildMilestoneBadge creates uppercase stable badge", () => {
  assert.equal(buildMilestoneBadge("Route Stabilized", 2), "ROUTE-STABILIZED-2");
});
