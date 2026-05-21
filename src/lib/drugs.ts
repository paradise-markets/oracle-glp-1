import { createHash } from "node:crypto";
import type { Drug, DrugSlug, SourceId } from "./types";

function deriveDrugId(slug: DrugSlug, rxcui: string) {
  return createHash("sha256").update(`${slug}:${rxcui}`).digest("hex");
}

export const DRUGS: Record<DrugSlug, Drug> = {
  wegovy: {
    slug: "wegovy",
    drugId: deriveDrugId("wegovy", "2589005"),
    brandName: "Wegovy",
    genericName: "semaglutide 2.4mg",
    manufacturer: "Novo Nordisk",
    indication: "Weight loss",
    format: "pen",
    ndcPrimary: "00169452513",
    rxcui: "2589005",
  },
  ozempic: {
    slug: "ozempic",
    drugId: deriveDrugId("ozempic", "1991311"),
    brandName: "Ozempic",
    genericName: "semaglutide 0.5/1/2mg",
    manufacturer: "Novo Nordisk",
    indication: "T2D",
    format: "pen",
    ndcPrimary: "00169418113",
    rxcui: "1991311",
  },
  rybelsus: {
    slug: "rybelsus",
    drugId: deriveDrugId("rybelsus", "2200650"),
    brandName: "Rybelsus",
    genericName: "semaglutide 7/14mg",
    manufacturer: "Novo Nordisk",
    indication: "T2D",
    format: "tablet",
    ndcPrimary: "00169430330",
    rxcui: "2200650",
  },
  mounjaro: {
    slug: "mounjaro",
    drugId: deriveDrugId("mounjaro", "2601758"),
    brandName: "Mounjaro",
    genericName: "tirzepatide 2.5-15mg",
    manufacturer: "Eli Lilly",
    indication: "T2D",
    format: "pen",
    ndcPrimary: "00002149580",
    rxcui: "2601758",
  },
  zepbound: {
    slug: "zepbound",
    drugId: deriveDrugId("zepbound", "2601776"),
    brandName: "Zepbound",
    genericName: "tirzepatide 2.5-15mg",
    manufacturer: "Eli Lilly",
    indication: "Weight loss",
    format: "vial",
    ndcPrimary: "00002227180",
    rxcui: "2601776",
  },
};

export const SOURCE_DESCRIPTIONS: Record<SourceId, string> = {
  NADAC: "CMS National Average Drug Acquisition Cost",
  NOVOCARE: "NovoCare Pharmacy direct cash price",
  LILLYDIRECT: "LillyDirect direct cash price",
  NOVO_LIST: "Novo Nordisk list price disclosure",
  LILLY_LIST: "Eli Lilly pricing information",
  MANUAL: "Manually supplied observation",
};

export function parseDrugSlug(value: string | undefined): DrugSlug | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  return normalized in DRUGS ? (normalized as DrugSlug) : undefined;
}

export function parseSourceId(value: string | undefined): SourceId | undefined {
  if (!value) return undefined;
  const normalized = value.toUpperCase();
  return normalized in SOURCE_DESCRIPTIONS ? (normalized as SourceId) : undefined;
}
