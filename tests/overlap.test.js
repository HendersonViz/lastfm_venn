import test from "node:test";
import assert from "node:assert/strict";

import { computeOverlap, fingerprintLabel } from "../src/overlap.js";

test("computes Jaccard overlap and preserves harmonic-mean ranking", () => {
  const result = computeOverlap(
    [
      { name: "Shared favourite", playcount: 100, rank: 1 },
      { name: "Balanced", playcount: 40, rank: 2 },
      { name: "Left only", playcount: 20, rank: 3 },
    ],
    [
      { name: "shared FAVOURITE", playcount: 20, rank: 2 },
      { name: "Balanced", playcount: 40, rank: 1 },
      { name: "Right only", playcount: 20, rank: 3 },
    ],
  );

  assert.deepEqual(result.counts, {
    user1Total: 3,
    user2Total: 3,
    user1Only: 1,
    user2Only: 1,
    shared: 2,
    combinedUnique: 4,
  });
  assert.equal(result.overlapPercentage, 50);
  assert.equal(result.rankedShared[0].artist, "Balanced");
  assert.equal(result.rankedShared[0].matchScore, 40);
  assert.equal(result.rankedShared[1].matchScore, 33.33);
});

test("chooses a deep cut that is low-ranked for both users", () => {
  const result = computeOverlap(
    [
      { name: "One-sided obscurity", playcount: 100, rank: 1 },
      { name: "Mutual deep cut", playcount: 5, rank: 400 },
    ],
    [
      { name: "One-sided obscurity", playcount: 4, rank: 800 },
      { name: "Mutual deep cut", playcount: 6, rank: 350 },
    ],
  );

  assert.deepEqual(result.fingerprint.deepCut, {
    artist: "Mutual deep cut",
    user1Rank: 400,
    user2Rank: 350,
  });
});

test("fingerprint labels are deterministic at their boundaries", () => {
  assert.equal(fingerprintLabel(0, 0), "Parallel Universes");
  assert.equal(fingerprintLabel(60, 50), "Musical Twins");
  assert.equal(fingerprintLabel(30, 30), "Same Scene, Different Tables");
  assert.equal(fingerprintLabel(10, 2), "A Few Excellent Agreements");
  assert.equal(fingerprintLabel(2, 1), "A Small but Mighty Crossover");
});

test("handles two empty libraries without NaN values", () => {
  const result = computeOverlap([], []);
  assert.equal(result.overlapPercentage, 0);
  assert.equal(result.fingerprint.deepCut, null);
  assert.equal(result.fingerprint.label, "Parallel Universes");
});
