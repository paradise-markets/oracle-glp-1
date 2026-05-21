import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { buildAggregatedFeed, validateFeedUpdate } from "./aggregate";
import { createDemoObservations } from "./demo-data";
import { DRUGS, parseDrugSlug, parseSourceId } from "./drugs";
import { microcentsToUsd, usdToMicrocents } from "./money";
import type {
  AggregatedFeed,
  AggregateRequest,
  ApiObservationInput,
  DrugSlug,
  OracleSnapshot,
  PriceObservation,
} from "./types";

export class OracleStore {
  private observations = new Map<string, PriceObservation>();
  private feeds = new Map<DrugSlug, AggregatedFeed>();

  constructor(private readonly storagePath?: string) {
    if (storagePath && existsSync(storagePath)) {
      this.load();
      return;
    }

    for (const observation of createDemoObservations()) {
      this.observations.set(observation.id, observation);
    }
    this.aggregate({});
  }

  listDrugs() {
    return Object.values(DRUGS);
  }

  getDrug(drugId: string) {
    const slug = parseDrugSlug(drugId);
    return slug ? DRUGS[slug] : undefined;
  }

  listObservations(filters: { drugId?: string; sourceId?: string } = {}) {
    const drugId = parseDrugSlug(filters.drugId);
    const sourceId = parseSourceId(filters.sourceId);

    return [...this.observations.values()]
      .filter((observation) => !drugId || observation.drugId === drugId)
      .filter((observation) => !sourceId || observation.sourceId === sourceId)
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  }

  addObservation(input: ApiObservationInput) {
    const drugId = parseDrugSlug(input.drug_id ?? input.drugId);
    if (!drugId) {
      throw new Error("drug_id must be one of wegovy, ozempic, rybelsus, mounjaro, zepbound");
    }

    const sourceId = parseSourceId(input.source_id ?? input.sourceId) ?? "MANUAL";
    const monthlyEquivalentMicrocents =
      input.monthlyEquivalentMicrocents ??
      (typeof input.monthly_equivalent_usd === "number"
        ? usdToMicrocents(input.monthly_equivalent_usd)
        : undefined) ??
      input.priceMicrocents ??
      (typeof input.price_usd === "number" ? usdToMicrocents(input.price_usd) : undefined);

    if (!monthlyEquivalentMicrocents || monthlyEquivalentMicrocents <= 0) {
      throw new Error("monthly_equivalent_usd or monthlyEquivalentMicrocents must be positive");
    }

    const priceMicrocents =
      input.priceMicrocents ??
      (typeof input.price_usd === "number" ? usdToMicrocents(input.price_usd) : monthlyEquivalentMicrocents);
    const observedAt = input.observed_at ?? input.observedAt ?? new Date().toISOString();
    const format = input.format ?? DRUGS[drugId].format;

    if (!["pen", "vial", "tablet"].includes(format)) {
      throw new Error("format must be pen, vial, or tablet");
    }

    const observation: PriceObservation = {
      id: `${drugId}-${sourceId.toLowerCase()}-${Date.parse(observedAt)}-${crypto.randomUUID().slice(0, 8)}`,
      drugId,
      sourceId,
      priceMicrocents,
      monthlyEquivalentMicrocents,
      doseStrengthMg: input.dose_strength_mg ?? input.doseStrengthMg,
      format: format as PriceObservation["format"],
      rawExtract: input.raw_extract ?? input.rawExtract,
      sourceUrl: input.source_url ?? input.sourceUrl,
      ndc: input.ndc ?? DRUGS[drugId].ndcPrimary,
      observedAt,
    };

    this.observations.set(observation.id, observation);
    this.save();

    return observation;
  }

  replaceObservations(inputs: ApiObservationInput[]) {
    this.observations.clear();
    const observations = inputs.map((input) => this.addObservation(input));
    this.save();
    return observations;
  }

  listFeeds() {
    return [...this.feeds.values()].sort((a, b) => a.drugId.localeCompare(b.drugId));
  }

  getFeed(drugId: string) {
    const slug = parseDrugSlug(drugId);
    return slug ? this.feeds.get(slug) : undefined;
  }

  getHistory(drugId: string) {
    const slug = parseDrugSlug(drugId);
    if (!slug) return undefined;

    const observations = this.listObservations({ drugId: slug }).sort((a, b) =>
      a.observedAt.localeCompare(b.observedAt)
    );

    return observations.map((observation) => ({
      observedAt: observation.observedAt,
      sourceId: observation.sourceId,
      monthlyEquivalentUsd: microcentsToUsd(observation.monthlyEquivalentMicrocents),
      monthlyEquivalentMicrocents: observation.monthlyEquivalentMicrocents,
    }));
  }

  aggregate(request: AggregateRequest = {}) {
    const requestedDrugValue = request.drug_id ?? request.drugId;
    const requestedDrug = parseDrugSlug(requestedDrugValue);
    if (requestedDrugValue && !requestedDrug) {
      throw new Error("drug_id must be one of wegovy, ozempic, rybelsus, mounjaro, zepbound");
    }

    const drugIds = requestedDrug ? [requestedDrug] : (Object.keys(DRUGS) as DrugSlug[]);
    const updated: AggregatedFeed[] = [];
    const rejected: Array<{ drugId: DrugSlug; reason: string }> = [];
    const now = new Date();

    for (const drugId of drugIds) {
      const observations = this.listObservations({ drugId });
      const previous = this.feeds.get(drugId);
      const next = buildAggregatedFeed(drugId, observations, previous, now);

      if (!next) {
        rejected.push({ drugId, reason: "At least 2 source observations are required" });
        continue;
      }

      const rejection = validateFeedUpdate(next, previous, { force: request.force, now });
      if (rejection) {
        rejected.push({ drugId, reason: rejection });
        continue;
      }

      this.feeds.set(drugId, next);
      updated.push(next);
    }

    this.save();
    return { updated, rejected };
  }

  resetDemo() {
    this.observations.clear();
    this.feeds.clear();
    for (const observation of createDemoObservations()) {
      this.observations.set(observation.id, observation);
    }
    const result = this.aggregate({ force: true });
    this.save();
    return result;
  }

  snapshot(): OracleSnapshot {
    return {
      observations: [...this.observations.values()],
      feeds: [...this.feeds.values()],
    };
  }

  private load() {
    if (!this.storagePath) return;
    const snapshot = JSON.parse(readFileSync(this.storagePath, "utf8")) as OracleSnapshot;
    for (const observation of snapshot.observations ?? []) {
      this.observations.set(observation.id, observation);
    }
    for (const feed of snapshot.feeds ?? []) {
      this.feeds.set(feed.drugId, feed);
    }
  }

  private save() {
    if (!this.storagePath) return;
    writeFileSync(this.storagePath, JSON.stringify(this.snapshot(), null, 2));
  }
}
