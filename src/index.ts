import { Elysia } from "elysia";
import { SOURCE_DESCRIPTIONS } from "./lib/drugs";
import { feedResponse, observationResponse } from "./lib/api";
import { fetchLiveObservations, liveSourceUrls } from "./lib/live-sources";
import { OracleStore } from "./lib/store";

const port = Number(Bun.env.PORT ?? 3000);
const storagePath = Bun.env.ORACLE_STORAGE_PATH;
const store = new OracleStore(storagePath);

const app = new Elysia()
    .onError(({ code, error, set }) => {
        set.status = code === "NOT_FOUND" ? 404 : 400;
        return {
            error: error instanceof Error ? error.message : String(error),
        };
    })
    .get("/", () => ({
        name: "Paradise Market GLP-1 Oracle API",
        endpoints: [
            "GET /health",
            "GET /drugs",
            "GET /drugs/:drug_id",
            "GET /sources",
            "GET /observations?drug_id=wegovy&source_id=NADAC",
            "POST /observations",
            "POST /refresh/live",
            "POST /aggregate",
            "GET /feeds",
            "GET /feeds/:drug_id",
            "GET /history/:drug_id",
            "POST /demo/reset",
        ],
    }))
    .get("/health", () => ({
        ok: true,
        timestamp: new Date().toISOString(),
        feeds: store.listFeeds().length,
        observations: store.listObservations().length,
    }))
    .get("/sources", () => ({
        descriptions: SOURCE_DESCRIPTIONS,
        liveUrls: liveSourceUrls,
    }))
    .get("/drugs", () => store.listDrugs())
    .get("/drugs/:drug_id", ({ params, set }) => {
        const drug = store.getDrug(params.drug_id);
        if (!drug) {
            set.status = 404;
            return { error: "Unknown drug_id" };
        }
        return drug;
    })
    .get("/observations", ({ query }) =>
        store
            .listObservations({
                drugId: query.drug_id as string | undefined,
                sourceId: query.source_id as string | undefined,
            })
            .map(observationResponse),
    )
    .post("/observations", ({ body, set }) => {
        try {
            const observation = store.addObservation(
                body as Parameters<typeof store.addObservation>[0],
            );
            return observationResponse(observation);
        } catch (error) {
            set.status = 400;
            return {
                error:
                    error instanceof Error
                        ? error.message
                        : "Invalid observation",
            };
        }
    })
    .post("/refresh/live", async ({ body }) => {
        const options = (body ?? {}) as { replace?: boolean; force?: boolean };
        const live = await fetchLiveObservations();
        const observations =
            options.replace === false
                ? live.observations.map((observation) =>
                      store.addObservation(observation),
                  )
                : store.replaceObservations(live.observations);
        const aggregateResult = store.aggregate({ force: options.force ?? true });

        return {
            fetchedAt: live.fetchedAt,
            observationCount: observations.length,
            observations: observations.map(observationResponse),
            updated: aggregateResult.updated.map(feedResponse),
            rejected: aggregateResult.rejected,
            failures: live.failures,
        };
    })
    .post("/aggregate", ({ body }) => {
        const result = store.aggregate(
            (body ?? {}) as Parameters<typeof store.aggregate>[0],
        );
        return {
            updated: result.updated.map(feedResponse),
            rejected: result.rejected,
        };
    })
    .get("/feeds", () => store.listFeeds().map(feedResponse))
    .get("/feeds/:drug_id", ({ params, set }) => {
        const feed = store.getFeed(params.drug_id);
        if (!feed) {
            set.status = 404;
            return { error: "No feed found for drug_id" };
        }
        return feedResponse(feed);
    })
    .get("/history/:drug_id", ({ params, set }) => {
        const history = store.getHistory(params.drug_id);
        if (!history) {
            set.status = 404;
            return { error: "Unknown drug_id" };
        }
        return history;
    })
    .post("/demo/reset", () => {
        const result = store.resetDemo();
        return {
            updated: result.updated.map(feedResponse),
            rejected: result.rejected,
        };
    })
    .listen(port);

console.log(
    `Paradise oracle API is running at http://${app.server?.hostname}:${app.server?.port}`,
);
