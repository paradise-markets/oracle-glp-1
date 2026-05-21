import { DRUGS } from "./drugs";
import { usdToMicrocents } from "./money";
import type { ApiObservationInput, DrugFormat, DrugSlug, SourceId } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 ParadiseMarket-Oracle/0.1";

const NADAC_CATALOG_URL =
  "https://catalog.data.gov/dataset/nadac-national-average-drug-acquisition-cost-2026";
const NADAC_FALLBACK_URL =
  "https://download.medicaid.gov/data/nadac-national-average-drug-acquisition-cost-04-08-2026.csv";

const NOVOCARE_PHARMACY_URL = "https://www.novocare.com/pharmacy.html";

const NOVO_PRICING_URLS: Partial<Record<DrugSlug, string>> = {
  wegovy: "https://www.novopricing.com/wegovy.html",
  ozempic: "https://www.novopricing.com/ozempic.html",
  rybelsus: "https://www.novopricing.com/rybelsus.html",
};

const LILLY_URLS = {
  zepboundTerms:
    "https://www.lilly.com/lillydirect/medicines/zepbound/self-pay-journey-program-purchase-offer-full-terms-conditions",
  zepboundPricing: "https://pricinginfo.lilly.com/zepbound",
  mounjaroPricing: "https://pricinginfo.lilly.com/mounjaro",
};

const GLP1_BRAND_TO_DRUG: Record<string, DrugSlug> = {
  WEGOVY: "wegovy",
  OZEMPIC: "ozempic",
  RYBELSUS: "rybelsus",
  MOUNJARO: "mounjaro",
  ZEPBOUND: "zepbound",
};

export interface LiveRefreshResult {
  observations: ApiObservationInput[];
  failures: Array<{ sourceId: SourceId; url: string; reason: string }>;
  fetchedAt: string;
}

interface NadacRow {
  description: string;
  ndc: string;
  nadacPerUnit: number;
  pricingUnit: string;
  effectiveDate: string;
  asOfDate: string;
}

export async function fetchLiveObservations(): Promise<LiveRefreshResult> {
  const fetchedAt = new Date().toISOString();
  const failures: LiveRefreshResult["failures"] = [];
  const settled = await Promise.allSettled([
    fetchNadacObservations(fetchedAt),
    fetchNovoCareObservations(fetchedAt),
    fetchNovoListObservations(fetchedAt),
    fetchLillyDirectObservations(fetchedAt),
    fetchLillyListObservations(fetchedAt),
  ]);

  const observations: ApiObservationInput[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      observations.push(...result.value.observations);
      failures.push(...result.value.failures);
      continue;
    }

    failures.push({
      sourceId: "MANUAL",
      url: "multiple",
      reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  }

  return { observations, failures, fetchedAt };
}

async function fetchNadacObservations(observedAt: string): Promise<LiveRefreshResult> {
  const failures: LiveRefreshResult["failures"] = [];
  const url = await resolveNadacCsvUrl().catch(() => NADAC_FALLBACK_URL);
  const text = await fetchText(url);
  const rows = parseNadacRows(text);
  const latestByDrug = new Map<DrugSlug, NadacRow[]>();

  for (const row of rows) {
    const drugId = drugFromDescription(row.description);
    if (!drugId) continue;

    const currentRows = latestByDrug.get(drugId);
    if (!currentRows || compareNadacDate(row.asOfDate, currentRows[0].asOfDate) > 0) {
      latestByDrug.set(drugId, [row]);
    } else if (currentRows && compareNadacDate(row.asOfDate, currentRows[0].asOfDate) === 0) {
      currentRows.push(row);
    }
  }

  const observations: ApiObservationInput[] = [];
  for (const [drugId, latestRows] of latestByDrug) {
    const normalized = latestRows
      .map((row) => monthlyEquivalentFromNadac(row))
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);

    if (normalized.length === 0) {
      failures.push({ sourceId: "NADAC", url, reason: `No normalizable NADAC rows for ${drugId}` });
      continue;
    }

    const monthlyEquivalentUsd = median(normalized);
    const representative = latestRows[0];
    observations.push({
      drug_id: drugId,
      source_id: "NADAC",
      price_usd: monthlyEquivalentUsd,
      monthly_equivalent_usd: monthlyEquivalentUsd,
      format: DRUGS[drugId].format,
      ndc: representative.ndc,
      raw_extract: `${representative.description}; ${representative.nadacPerUnit}/${
        representative.pricingUnit
      }; as of ${representative.asOfDate}; ${latestRows.length} latest rows`,
      source_url: url,
      observed_at: observedAt,
    });
  }

  return { observations, failures, fetchedAt: observedAt };
}

async function fetchNovoCareObservations(observedAt: string): Promise<LiveRefreshResult> {
  const text = htmlToText(await fetchText(NOVOCARE_PHARMACY_URL));
  const observations: ApiObservationInput[] = [];
  const failures: LiveRefreshResult["failures"] = [];

  const sections: Array<{ drugId: DrugSlug; label: string; format: DrugFormat }> = [
    { drugId: "wegovy", label: "Wegovy pen", format: "pen" },
    { drugId: "ozempic", label: "Ozempic pen", format: "pen" },
  ];

  for (const section of sections) {
    const price = priceNearLabel(text, section.label);
    if (!price) {
      failures.push({
        sourceId: "NOVOCARE",
        url: NOVOCARE_PHARMACY_URL,
        reason: `Could not parse ${section.label} self-pay price`,
      });
      continue;
    }

    observations.push({
      drug_id: section.drugId,
      source_id: "NOVOCARE",
      price_usd: price,
      monthly_equivalent_usd: price,
      format: section.format,
      raw_extract: `${section.label} starting at $${price} per month`,
      source_url: NOVOCARE_PHARMACY_URL,
      observed_at: observedAt,
    });
  }

  return { observations, failures, fetchedAt: observedAt };
}

async function fetchNovoListObservations(observedAt: string): Promise<LiveRefreshResult> {
  const observations: ApiObservationInput[] = [];
  const failures: LiveRefreshResult["failures"] = [];

  for (const [drugId, url] of Object.entries(NOVO_PRICING_URLS) as Array<[DrugSlug, string]>) {
    const text = htmlToText(await fetchText(url));
    const price = firstWacPrice(text);
    if (!price) {
      failures.push({ sourceId: "NOVO_LIST", url, reason: `Could not parse ${drugId} WAC price` });
      continue;
    }

    observations.push({
      drug_id: drugId,
      source_id: "NOVO_LIST",
      price_usd: price,
      monthly_equivalent_usd: price,
      format: DRUGS[drugId].format,
      raw_extract: `${DRUGS[drugId].brandName} WAC price $${price}`,
      source_url: url,
      observed_at: observedAt,
    });
  }

  return { observations, failures, fetchedAt: observedAt };
}

async function fetchLillyDirectObservations(observedAt: string): Promise<LiveRefreshResult> {
  const failures: LiveRefreshResult["failures"] = [];
  const observations: ApiObservationInput[] = [];
  const url = LILLY_URLS.zepboundTerms;
  const raw = await fetchText(url).catch((error) => {
    failures.push({
      sourceId: "LILLYDIRECT",
      url,
      reason: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  });
  if (!raw) return { observations, failures, fetchedAt: observedAt };

  const text = htmlToText(raw);

  if (isBlockedPage(text)) {
    return {
      observations,
      failures: [{ sourceId: "LILLYDIRECT", url, reason: "Lilly page returned an anti-bot challenge" }],
      fetchedAt: observedAt,
    };
  }

  const regularPriceMatch = text.match(
    /Regular price for a 1-month supply of Zepbound[\s\S]{0,260}?\$([\d,]+(?:\.\d{2})?)[\s\S]{0,40}?5 mg/i,
  );
  const offerMatch = text.match(/Pay \$([\d,]+(?:\.\d{2})?) for each 1-month supply/i);
  const price = regularPriceMatch ? dollars(regularPriceMatch[1]) : offerMatch ? dollars(offerMatch[1]) : undefined;

  if (!price) {
    failures.push({ sourceId: "LILLYDIRECT", url, reason: "Could not parse Zepbound direct price" });
    return { observations, failures, fetchedAt: observedAt };
  }

  observations.push({
    drug_id: "zepbound",
    source_id: "LILLYDIRECT",
    price_usd: price,
    monthly_equivalent_usd: price,
    format: "vial",
    raw_extract: `Zepbound 1-month self-pay price $${price}`,
    source_url: url,
    observed_at: observedAt,
  });

  return { observations, failures, fetchedAt: observedAt };
}

async function fetchLillyListObservations(observedAt: string): Promise<LiveRefreshResult> {
  const observations: ApiObservationInput[] = [];
  const failures: LiveRefreshResult["failures"] = [];
  const pages: Array<{ drugId: DrugSlug; url: string }> = [
    { drugId: "zepbound", url: LILLY_URLS.zepboundPricing },
    { drugId: "mounjaro", url: LILLY_URLS.mounjaroPricing },
  ];

  for (const page of pages) {
    const raw = await fetchText(page.url).catch((error) => {
      failures.push({
        sourceId: "LILLY_LIST",
        url: page.url,
        reason: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    });
    if (!raw) continue;

    const text = htmlToText(raw);
    const price = parseLillyListPrice(text);
    if (!price) {
      failures.push({
        sourceId: "LILLY_LIST",
        url: page.url,
        reason: `Could not parse ${page.drugId} list price from rendered text`,
      });
      continue;
    }

    observations.push({
      drug_id: page.drugId,
      source_id: "LILLY_LIST",
      price_usd: price,
      monthly_equivalent_usd: price,
      format: DRUGS[page.drugId].format,
      raw_extract: `${DRUGS[page.drugId].brandName} list price $${price}`,
      source_url: page.url,
      observed_at: observedAt,
    });
  }

  return { observations, failures, fetchedAt: observedAt };
}

async function resolveNadacCsvUrl() {
  const catalog = await fetchText(NADAC_CATALOG_URL);
  const match = catalog.match(/https:\/\/download\.medicaid\.gov\/data\/nadac-national-average-drug-acquisition-cost-[^"'<\s]+\.csv/);
  return match?.[0] ?? NADAC_FALLBACK_URL;
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,text/csv,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }

  return response.text();
}

function parseNadacRows(csv: string): NadacRow[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines.shift() ?? "");
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  const rows: NadacRow[] = [];

  for (const line of lines) {
    const columns = parseCsvLine(line);
    const nadacPerUnit = Number(columns[index["NADAC Per Unit"]]);
    if (!Number.isFinite(nadacPerUnit)) continue;

    rows.push({
      description: columns[index["NDC Description"]] ?? "",
      ndc: columns[index.NDC] ?? "",
      nadacPerUnit,
      effectiveDate: columns[index["Effective Date"]] ?? "",
      pricingUnit: columns[index["Pricing Unit"]] ?? "",
      asOfDate: columns[index["As of Date"]] ?? "",
    });
  }

  return rows;
}

function parseCsvLine(line: string) {
  const columns: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      columns.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  columns.push(current);
  return columns;
}

function drugFromDescription(description: string): DrugSlug | undefined {
  const upper = description.toUpperCase();
  const brand = Object.keys(GLP1_BRAND_TO_DRUG).find((candidate) => upper.startsWith(candidate));
  return brand ? GLP1_BRAND_TO_DRUG[brand] : undefined;
}

function monthlyEquivalentFromNadac(row: NadacRow) {
  const unit = row.pricingUnit.toUpperCase();
  if (unit === "EA") return row.nadacPerUnit * 30;
  if (unit !== "ML") return undefined;

  const mlMatch = row.description.match(/\/([\d.]+)\s*ML/i);
  const mlPerPen = mlMatch ? Number(mlMatch[1]) : undefined;
  if (!mlPerPen) return undefined;

  if (row.description.toUpperCase().includes("OZEMPIC")) {
    return row.nadacPerUnit * mlPerPen;
  }

  return row.nadacPerUnit * mlPerPen * 4;
}

function compareNadacDate(left: string, right: string) {
  return Date.parse(left) - Date.parse(right);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[®™]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function priceNearLabel(text: string, label: string) {
  const normalized = text.replace(/[®™]/g, "");
  const index = normalized.toLowerCase().indexOf(label.toLowerCase());
  if (index < 0) return undefined;
  const slice = normalized.slice(index, index + 260);
  const match = slice.match(/Starting at\s+\$([\d,]+(?:\.\d{2})?)/i);
  return match ? dollars(match[1]) : undefined;
}

function firstWacPrice(text: string) {
  const match = text.match(/WAC Price\s+\$([\d,]+(?:\.\d{2})?)/i);
  return match ? dollars(match[1]) : undefined;
}

function parseLillyListPrice(text: string) {
  const listPriceIndex = text.toLowerCase().indexOf("list price");
  if (listPriceIndex < 0) return undefined;
  const slice = text.slice(listPriceIndex, listPriceIndex + 280);
  const prices = [...slice.matchAll(/\$([\d,]+(?:\.\d{2})?)/g)]
    .map((match) => dollars(match[1]))
    .filter((value) => value > 100);
  return prices[0];
}

function dollars(raw: string) {
  return Number(raw.replace(/,/g, ""));
}

function isBlockedPage(text: string) {
  return /Just a moment|Enable JavaScript and cookies|challenge-platform|Cloudflare/i.test(text);
}

export const liveSourceUrls = {
  nadacCatalog: NADAC_CATALOG_URL,
  nadacFallback: NADAC_FALLBACK_URL,
  novoCarePharmacy: NOVOCARE_PHARMACY_URL,
  novoPricing: NOVO_PRICING_URLS,
  lilly: LILLY_URLS,
};
