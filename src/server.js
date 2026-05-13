import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appConfig } from "./config.js";
import { queryTemplates } from "./query-templates.js";
import { buildCliRequest, buildQueryFromPayload } from "./query-api.js";
import { getFieldSummary, listFields, listLogSets, runQuery, suggest } from "./oci-log-analytics.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");

const app = express();

app.use(express.json());
app.use(express.static(publicDir));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    mockMode: appConfig.mockMode
  });
});

app.get("/api/bootstrap", async (_req, res) => {
  try {
    const [logSets, fields, fieldSummary] = await Promise.all([
      listLogSets(),
      listFields(),
      getFieldSummary()
    ]);
    res.json({
      logSets,
      fields,
      fieldSummary,
      templates: queryTemplates,
      mockMode: appConfig.mockMode
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.post("/api/suggest", async (req, res) => {
  try {
    const suggestions = await suggest(req.body || {});
    res.json({ suggestions });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.post("/api/template-query", (req, res) => {
  listFields()
    .then((fields) => {
      const { query, template } = buildQueryFromPayload(req.body || {}, { availableFields: fields });
      return res.json({
        query,
        templateId: template?.id || null
      });
    })
    .catch((error) => {
      const statusCode = error.message.includes("required") || error.message.includes("resolve") ? 400 : 404;
      return res.status(statusCode).json({ error: error.message });
    });
});

app.post("/api/cli-query", (req, res) => {
  listFields()
    .then((fields) => {
      const builtQuery = buildQueryFromPayload(req.body || {}, { availableFields: fields });
      const cli = buildCliRequest({
        ...req.body,
        queryText: builtQuery.query
      });

      return res.json({
        query: builtQuery.query,
        querySource: builtQuery.querySource,
        templateId: builtQuery.template?.id || null,
        visualization: builtQuery.visualization,
        selectedFields: builtQuery.selectedFields,
        cli
      });
    })
    .catch((error) => {
      const statusCode = error.message.includes("required") || error.message.includes("resolve") ? 400 : 404;
      return res.status(statusCode).json({ error: error.message });
    });
});

app.post("/api/query", async (req, res) => {
  try {
    const { queryText, timeStart, timeEnd } = req.body || {};

    if (!queryText) {
      return res.status(400).json({ error: "queryText is required." });
    }

    const result = await runQuery({
      queryText,
      timeStart,
      timeEnd
    });

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
});

app.listen(appConfig.port, () => {
  console.log(`OCILA guided query app running at http://localhost:${appConfig.port}`);
});
