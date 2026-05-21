import { microcentsToUsd } from "./money";
import type { AggregatedFeed, PriceObservation } from "./types";

export function observationResponse(observation: PriceObservation) {
  return {
    ...observation,
    priceUsd: microcentsToUsd(observation.priceMicrocents),
    monthlyEquivalentUsd: microcentsToUsd(observation.monthlyEquivalentMicrocents),
  };
}

export function feedResponse(feed: AggregatedFeed) {
  return {
    ...feed,
    aggregateUsd: microcentsToUsd(feed.aggregateMicrocents),
    lowUsd: microcentsToUsd(feed.lowMicrocents),
    highUsd: microcentsToUsd(feed.highMicrocents),
  };
}
