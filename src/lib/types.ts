export type DrugSlug = "wegovy" | "ozempic" | "rybelsus" | "mounjaro" | "zepbound";

export type SourceId =
  | "NADAC"
  | "NOVOCARE"
  | "LILLYDIRECT"
  | "NOVO_LIST"
  | "LILLY_LIST"
  | "MANUAL";

export type DrugFormat = "pen" | "vial" | "tablet";

export interface Drug {
  slug: DrugSlug;
  drugId: string;
  brandName: string;
  genericName: string;
  manufacturer: "Novo Nordisk" | "Eli Lilly";
  indication: "Weight loss" | "T2D";
  format: DrugFormat;
  ndcPrimary: string;
  rxcui: string;
}

export interface PriceObservation {
  id: string;
  drugId: DrugSlug;
  sourceId: SourceId;
  priceMicrocents: number;
  monthlyEquivalentMicrocents: number;
  doseStrengthMg?: number;
  format: DrugFormat;
  rawExtract?: string;
  sourceUrl?: string;
  ndc?: string;
  observedAt: string;
}

export interface AggregatedFeed {
  drugId: DrugSlug;
  aggregateMicrocents: number;
  lowMicrocents: number;
  highMicrocents: number;
  sourceCount: number;
  lastAggregatedAt: string;
  updateCount: number;
  observationsUsed: string[];
  observationsDropped: string[];
}

export interface ApiObservationInput {
  drug_id?: string;
  drugId?: string;
  source_id?: string;
  sourceId?: string;
  price_usd?: number;
  priceMicrocents?: number;
  monthly_equivalent_usd?: number;
  monthlyEquivalentMicrocents?: number;
  dose_strength_mg?: number;
  doseStrengthMg?: number;
  format?: string;
  raw_extract?: string;
  rawExtract?: string;
  source_url?: string;
  sourceUrl?: string;
  ndc?: string;
  observed_at?: string;
  observedAt?: string;
}

export interface AggregateRequest {
  drug_id?: string;
  drugId?: string;
  force?: boolean;
}

export interface OracleSnapshot {
  observations: PriceObservation[];
  feeds: AggregatedFeed[];
}
