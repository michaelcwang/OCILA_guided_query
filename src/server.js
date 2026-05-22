import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appConfig } from "./config.js";
import { queryTemplates } from "./query-templates.js";
import {
  buildCliRequest,
  buildQueryFromPayload,
  validateQueryExecutionPayload,
  validateSuggestPayload
} from "./query-api.js";
import { getFieldSummary, listFields, listLogSets, runQuery, suggest } from "./oci-log-analytics.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");
const API_RATE_LIMIT = { windowMs: 60_000, max: 120 };
const QUERY_RATE_LIMIT = { windowMs: 60_000, max: 20 };
const requestBuckets = new Map();

const app = express();

function clientKey(req) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function rateLimit(options) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${clientKey(req)}:${req.path}:${options.max}`;
    const bucket = requestBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      requestBuckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
      res.set("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: "Too many requests. Please slow down and retry." });
    }

    return next();
  };
}

function cleanupRateLimitBuckets() {
  const now = Date.now();
  for (const [key, bucket] of requestBuckets.entries()) {
    if (bucket.resetAt <= now) {
      requestBuckets.delete(key);
    }
  }
}

function normalizeHostname(value = "") {
  return value.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

function allowedHostnames() {
  return new Set([
    "localhost",
    "127.0.0.1",
    "::1",
    normalizeHostname(appConfig.host),
    ...appConfig.allowedHosts.map(normalizeHostname)
  ]);
}

function requestHostname(req) {
  return normalizeHostname(req.hostname || "");
}

function isAllowedOrigin(originHeader) {
  if (!originHeader) {
    return true;
  }

  try {
    const origin = new URL(originHeader);
    return allowedHostnames().has(normalizeHostname(origin.hostname));
  } catch {
    return false;
  }
}

function enforceLocalAccess(req, res, next) {
  if (!allowedHostnames().has(requestHostname(req))) {
    return res.status(403).json({ error: "Host is not allowed." });
  }
  if (!isAllowedOrigin(req.get("origin"))) {
    return res.status(403).json({ error: "Origin is not allowed." });
  }

  return next();
}

function securityHeaders(_req, res, next) {
  res.set({
    "Content-Security-Policy":
      "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  });
  return next();
}

function sendError(res, error, fallbackStatus = 500) {
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : fallbackStatus;
  if (statusCode >= 500) {
    console.error(error);
    return res.status(statusCode).json({
      error: "Request failed while processing the backend operation."
    });
  }

  return res.status(statusCode).json({
    error: error.message || "Request failed."
  });
}

setInterval(cleanupRateLimitBuckets, API_RATE_LIMIT.windowMs).unref();

app.disable("x-powered-by");
app.use(securityHeaders);
app.use("/api", enforceLocalAccess, rateLimit(API_RATE_LIMIT));
app.use(express.json({ limit: "32kb", strict: true }));
app.use((error, _req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({
      error: "Malformed JSON request body."
    });
  }

  return next(error);
});
app.use(express.static(publicDir, {
  dotfiles: "deny",
  index: "index.html",
  setHeaders(res) {
    res.set("Cache-Control", "no-store");
  }
}));

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
    sendError(res, error);
  }
});

app.post("/api/suggest", async (req, res) => {
  try {
    const suggestions = await suggest(validateSuggestPayload(req.body || {}));
    res.json({ suggestions });
  } catch (error) {
    sendError(res, error);
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
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 400;
      return sendError(res, error, statusCode);
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
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 400;
      return sendError(res, error, statusCode);
    });
});

app.post("/api/query", rateLimit(QUERY_RATE_LIMIT), async (req, res) => {
  try {
    const { queryText, timeStart, timeEnd } = validateQueryExecutionPayload(req.body || {});

    const result = await runQuery({
      queryText,
      timeStart,
      timeEnd
    });

    return res.json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

app.use((error, _req, res, _next) => {
  sendError(res, error);
});

app.listen(appConfig.port, appConfig.host, () => {
  console.log(`OCILA guided query app running at http://${appConfig.host}:${appConfig.port}`);
});
