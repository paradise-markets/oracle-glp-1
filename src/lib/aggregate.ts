import type { AggregatedFeed, DrugSlug, PriceObservation } from "./types";

const ONE_HOUR_MS = 60 * 60 * 1000;

export function latestObservationPerSource(observations: PriceObservation[]) {
  const bySource = new Map<string, PriceObservation>();

  for (const observation of observations) {
    const previous = bySource.get(observation.sourceId);
    if (!previous || observation.observedAt > previous.observedAt) {
      bySource.set(observation.sourceId, observation);
    }
  }

  return [...bySource.values()];
}

export function buildAggregatedFeed(
  drugId: DrugSlug,
  observations: PriceObservation[],
  previous?: AggregatedFeed,
  now = new Date()
): AggregatedFeed | null {
  const latest = latestObservationPerSource(observations).sort((a, b) =>
    a.monthlyEquivalentMicrocents - b.monthlyEquivalentMicrocents
  );

  if (latest.length < 2) return null;

  const median = latest[Math.floor(latest.length / 2)].monthlyEquivalentMicrocents;
  const lowFence = median / 5;
  const highFence = median * 5;
  const used = latest.filter(
    (observation) =>
      observation.monthlyEquivalentMicrocents >= lowFence &&
      observation.monthlyEquivalentMicrocents <= highFence
  );

  if (used.length < 2) return null;

  const sum = used.reduce((acc, observation) => acc + observation.monthlyEquivalentMicrocents, 0);
  const aggregateMicrocents = Math.round(sum / used.length);

  return {
    drugId,
    aggregateMicrocents,
    lowMicrocents: Math.min(...used.map((observation) => observation.monthlyEquivalentMicrocents)),
    highMicrocents: Math.max(...used.map((observation) => observation.monthlyEquivalentMicrocents)),
    sourceCount: used.length,
    lastAggregatedAt: now.toISOString(),
    updateCount: previous ? previous.updateCount + 1 : 1,
    observationsUsed: used.map((observation) => observation.id),
    observationsDropped: latest
      .filter((observation) => !used.includes(observation))
      .map((observation) => observation.id),
  };
}

export function validateFeedUpdate(
  next: AggregatedFeed,
  previous: AggregatedFeed | undefined,
  options: { force?: boolean; now?: Date } = {}
) {
  if (next.lowMicrocents > next.aggregateMicrocents || next.aggregateMicrocents > next.highMicrocents) {
    return "Invalid price range: low <= aggregate <= high required";
  }

  if (next.sourceCount < 2) {
    return "At least 2 sources required for an update";
  }

  if (!previous || options.force) return undefined;

  const now = options.now ?? new Date();
  const last = new Date(previous.lastAggregatedAt);
  const elapsedMs = now.getTime() - last.getTime();
  const unchanged = next.aggregateMicrocents === previous.aggregateMicrocents;

  if (!unchanged && elapsedMs < ONE_HOUR_MS) {
    return "Updates must be at least 1 hour apart";
  }

  const deviation = Math.abs(next.aggregateMicrocents - previous.aggregateMicrocents);
  if (deviation * 2 > previous.aggregateMicrocents) {
    return "Price deviation exceeds 50% guard";
  }

  return undefined;
}
