import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appConfig } from "./config.js";
import { queryTemplates, getTemplateById } from "./query-templates.js";
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
  const { templateId, logSet, field, value, timeSpan, filterText } = req.body || {};
  const template = getTemplateById(templateId);

  if (!template) {
    return res.status(404).json({ error: "Template not found." });
  }

  if (!logSet) {
    return res.status(400).json({ error: "logSet is required." });
  }

  const query = template.queryBuilder({
    logSet,
    field,
    value,
    timeSpan,
    filterText
  });

  return res.json({
    query
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
