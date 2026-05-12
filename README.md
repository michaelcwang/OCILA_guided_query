# OCILA Guided Query

Local browser app for guided OCI Log Analytics investigations. The UI starts from a `Log Set` / pod, lets an operator pick a common investigation goal, suggests useful fields and field values, builds a query, and runs it through a local Node backend.

## What this first version covers

- Browser UI at `http://localhost:4310`
- Freeform `Log Set` / pod entry with known log set suggestions and comma-separated multi-pod support
- Guided templates for:
  - Fusion order validation
  - Fusion order throughput
  - Slow running database queries
  - Database connections
  - Application uptime
  - Blocking sessions
  - Database ID lookup
  - API endpoint correlation
- Query preview and manual editing
- Local visualization directive in the query editor for table, line, bar, or metric views
- Result visualization area for chart and metric rendering
- Saved query history in browser local storage
- In-product training help tied to each investigation template
- Query glossary help based on operators detected in the current query text
- Field and value suggestion endpoint
- API endpoint that returns generated query text plus an OCI CLI payload/command
- Custom field selector backed by Log Analytics field metadata
- Mock mode for UI development without OCI credentials

## Run locally

1. Copy `.env.example` to `.env`
2. Leave `MOCK_MODE=true` for UI-only testing, or set `MOCK_MODE=false` and fill in OCI settings
3. Install dependencies with `npm install`
4. Start the app with `npm run dev`

## OCI integration notes

This project is wired to use the Oracle Cloud Infrastructure JavaScript SDK. You can authenticate in two ways:

- `OCI_AUTH_MODE=config`
  - Reads from `OCI_CONFIG_FILE` and `OCI_CONFIG_PROFILE`
- `OCI_AUTH_MODE=direct`
  - Reads tenancy, user, fingerprint, region, and private key path from environment variables

You still need to verify the exact field names used in your tenancy and log sources. The templates intentionally keep the generated queries editable because field availability varies across pods, products, and log source mappings.

## Query generation API

The server now exposes `POST /api/cli-query` for automation use cases. You can pass either:

- `queryText` for a manually authored query
- or the same template inputs the UI uses: `templateId`, `logSet`, `field`, `value`, `timeSpan`, `filterText`, and `selectedFields`

Optional execution fields are also accepted and folded into the OCI CLI payload:

- `timeStart`
- `timeEnd`
- `namespaceName`
- `compartmentId`
- `subSystem`
- `timezone`
- `shouldRunAsync`
- `asyncMode`
- `shouldIncludeColumns`
- `shouldIncludeFields`
- `shouldIncludeTotalCount`
- `shouldUseAcceleration`
- `compartmentIdInSubtree`
- `limit`
- `maxTotalCount`
- `queryTimeoutInSeconds`

Example request:

```json
{
  "templateId": "slow-db-queries",
  "logSet": "sample-pod-prod,sample-db-observability",
  "timeSpan": "5minute",
  "filterText": "DBName = 'FINDB'",
  "selectedFields": ["SQL_ID", "DBName", "Elapsed Time"],
  "timeStart": "2026-05-12T00:00:00Z",
  "timeEnd": "2026-05-12T01:00:00Z",
  "shouldIncludeColumns": true,
  "shouldIncludeFields": true,
  "limit": 200
}
```

Example response shape:

```json
{
  "query": "(...) | fields SQL_ID, DBName, Elapsed Time",
  "querySource": "template",
  "templateId": "slow-db-queries",
  "visualization": null,
  "selectedFields": ["SQL_ID", "DBName", "Elapsed Time"],
  "cli": {
    "cliRequest": {
      "compartmentId": "<OCI_LOG_ANALYTICS_COMPARTMENT_OCID>",
      "namespaceName": "<OCI_LOG_ANALYTICS_NAMESPACE>",
      "queryString": "(...) | fields SQL_ID, DBName, Elapsed Time",
      "subSystem": "LOG",
      "timeStart": "2026-05-12T00:00:00.000Z",
      "timeEnd": "2026-05-12T01:00:00.000Z",
      "shouldIncludeColumns": true,
      "shouldIncludeFields": true,
      "limit": 200
    },
    "inlineCommand": "oci log-analytics query search ...",
    "fromJsonCommand": "oci log-analytics query search --from-json file://ocila-query-request.json"
  }
}
```

The `cliRequest` object is intended to be saved directly as `ocila-query-request.json` and then executed with the returned `fromJsonCommand`.

## Training content

The user-facing help content lives under `public/help/`:

- `template-guides.json`
  - Explains what each investigation template is trying to answer, how to read it, what signals matter, and what to do next
- `query-glossary.json`
  - Explains common OCILA query concepts such as `link span`, `stats`, `addfields`, `count_distinct`, `ECID`, and `Duration`

## Sensitive data guidance

This app treats sensitive-data handling as an ingestion design topic, not a query-only topic.

- Use Oracle Log Analytics source data filters to mask or hash-mask sensitive values, drop specific values, or hide entire log entries before analysts query them
- If logs are collected with the Management Agent, masking occurs before content leaves your premises
- If logs are uploaded on demand or collected from Object Storage, masking occurs on the cloud side before indexing
- Hash-masked values can still be searched when you know the candidate value and apply a hash function such as `md5()` in the query

## Next improvements

- Persist investigation presets per pod / use case
- Add domain-specific prompt packs for Fusion, database, and application troubleshooting
- Add saved query export and sharing
- Add template-specific drill-down actions from result rows
