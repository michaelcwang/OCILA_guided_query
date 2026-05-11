# OCILA Guided Query

Local browser app for guided OCI Log Analytics investigations. The UI starts from a `Log Set` / pod, lets an operator pick a common investigation goal, suggests useful fields and field values, builds a query, and runs it through a local Node backend.

## What this first version covers

- Browser UI at `http://localhost:4310`
- Freeform `Log Set` / pod entry with known log set suggestions
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
- Field and value suggestion endpoint
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

## Next improvements

- Persist investigation presets per pod / use case
- Add chart visualizations for time-series queries
- Add domain-specific prompt packs for Fusion, database, and application troubleshooting
- Add saved query history and export
