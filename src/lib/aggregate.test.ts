import { describe, expect, test } from "bun:test";
import { buildAggregatedFeed, validateFeedUpdate } from "./aggregate";
import { usdToMicrocents } from "./money";
import type { PriceObservation } from "./types";

function observation(id: string, sourceId: PriceObservation["sourceId"], usd: number): PriceObservation {
  return {
    id,
    drugId: "wegovy",
    sourceId,
    priceMicrocents: usdToMicrocents(usd),
    monthlyEquivalentMicrocents: usdToMicrocents(usd),
    format: "pen",
    observedAt: "2026-05-08T07:00:00.000Z",
  };
}

describe("aggregation", () => {
  test("computes a filtered mean over latest source observations", () => {
    const feed = buildAggregatedFeed("wegovy", [
      observation("a", "NADAC", 800),
      observation("b", "NOVOCARE", 350),
      observation("c", "NOVO_LIST", 1300),
      observation("d", "MANUAL", 10000),
    ]);

    expect(feed?.sourceCount).toBe(3);
    expect(feed?.aggregateMicrocents).toBe(usdToMicrocents((350 + 800 + 1300) / 3));
    expect(feed?.observationsDropped).toEqual(["d"]);
  });

  test("rejects a large non-forced deviation", () => {
    const previous = buildAggregatedFeed("wegovy", [
      observation("a", "NADAC", 800),
      observation("b", "NOVOCARE", 400),
    ], undefined, new Date("2026-05-08T07:00:00.000Z"));
    const next = buildAggregatedFeed("wegovy", [
      observation("c", "NADAC", 2000),
      observation("d", "NOVOCARE", 2200),
    ], previous ?? undefined, new Date("2026-05-08T09:00:00.000Z"));

    expect(previous).not.toBeNull();
    expect(next).not.toBeNull();
    expect(validateFeedUpdate(next!, previous!, { now: new Date("2026-05-08T09:00:00.000Z") }))
      .toBe("Price deviation exceeds 50% guard");
    expect(validateFeedUpdate(next!, previous!, { force: true })).toBeUndefined();
  });
});
