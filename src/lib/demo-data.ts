import { DRUGS } from "./drugs";
import { usdToMicrocents } from "./money";
import type { DrugSlug, PriceObservation, SourceId } from "./types";

const observedAt = "2026-05-08T07:00:00.000Z";

const rows: Array<[DrugSlug, SourceId, number, string]> = [
  ["wegovy", "NADAC", 822.4, "NADAC monthly equivalent from GLP-1 NDC sample"],
  ["wegovy", "NOVOCARE", 349, "NovoCare self-pay pharmacy price"],
  ["wegovy", "NOVO_LIST", 1349.02, "Wegovy list price package disclosure"],
  ["ozempic", "NADAC", 768.18, "NADAC monthly equivalent from GLP-1 NDC sample"],
  ["ozempic", "NOVOCARE", 499, "NovoCare self-pay pharmacy price"],
  ["ozempic", "NOVO_LIST", 1027.51, "Ozempic list price fill disclosure"],
  ["rybelsus", "NADAC", 714.72, "NADAC monthly equivalent from GLP-1 NDC sample"],
  ["rybelsus", "NOVOCARE", 499, "NovoCare self-pay pharmacy price"],
  ["rybelsus", "NOVO_LIST", 997.58, "Rybelsus list price package disclosure"],
  ["mounjaro", "NADAC", 907.33, "NADAC monthly equivalent from GLP-1 NDC sample"],
  ["mounjaro", "LILLYDIRECT", 499, "LillyDirect cash price sample"],
  ["mounjaro", "LILLY_LIST", 1086.37, "Mounjaro list price package disclosure"],
  ["zepbound", "NADAC", 887.75, "NADAC monthly equivalent from GLP-1 NDC sample"],
  ["zepbound", "LILLYDIRECT", 399, "LillyDirect self-pay vial price sample"],
  ["zepbound", "LILLY_LIST", 1086.37, "Zepbound list price package disclosure"],
];

export function createDemoObservations(): PriceObservation[] {
  return rows.map(([drugId, sourceId, usd, rawExtract], index) => ({
    id: `demo-${drugId}-${sourceId.toLowerCase()}`,
    drugId,
    sourceId,
    priceMicrocents: usdToMicrocents(usd),
    monthlyEquivalentMicrocents: usdToMicrocents(usd),
    format: DRUGS[drugId].format,
    rawExtract,
    ndc: DRUGS[drugId].ndcPrimary,
    observedAt: new Date(new Date(observedAt).getTime() + index * 1000).toISOString(),
  }));
}
