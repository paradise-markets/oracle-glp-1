export const MICROCENTS_PER_USD = 1_000_000;

export function usdToMicrocents(usd: number) {
  return Math.round(usd * MICROCENTS_PER_USD);
}

export function microcentsToUsd(microcents: number) {
  return Math.round((microcents / MICROCENTS_PER_USD) * 100) / 100;
}

export function formatUsd(microcents: number) {
  return microcentsToUsd(microcents).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
