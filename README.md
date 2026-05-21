# Paradise Markets GLP-1 Oracle API

Public prototype oracle API for the Paradise Markets GLP-1 price feed. It exposes the drug registry, source observations, aggregated feeds, and a small history endpoint that dashboards can consume.

## Development

```bash
bun run dev
```

The API listens on `http://localhost:3000` by default. Set `PORT` to override it.

## Endpoints

- `GET /health`
- `GET /drugs`
- `GET /drugs/:drug_id`
- `GET /sources`
- `GET /observations?drug_id=wegovy&source_id=NADAC`
- `POST /observations`
- `POST /refresh/live`
- `POST /aggregate`
- `GET /feeds`
- `GET /feeds/:drug_id`
- `GET /history/:drug_id`
- `POST /demo/reset`

## Add an observation

```bash
curl -X POST http://localhost:3000/observations \
  -H 'content-type: application/json' \
  -d '{
    "drug_id": "wegovy",
    "source_id": "NOVOCARE",
    "monthly_equivalent_usd": 349,
    "raw_extract": "$349 per month self-pay"
  }'
```

Then recompute one feed:

```bash
curl -X POST http://localhost:3000/aggregate \
  -H 'content-type: application/json' \
  -d '{"drug_id":"wegovy","force":true}'
```

## Fetch live public data

This pulls the current public source pages from CMS/NADAC, NovoCare, NovoPricing, and Lilly pages, replaces local observations, and recomputes feeds.

```bash
curl -X POST http://localhost:3000/refresh/live \
  -H 'content-type: application/json' \
  -d '{"force":true}'
```

Use `{"replace":false}` if you want to append live observations instead of replacing the local in-memory set.

## Notes

The API starts with demo observations for all five PRD drugs so the dashboard can be built immediately. Set `ORACLE_STORAGE_PATH=./oracle-state.json` if you want the in-memory state persisted to disk between restarts.
