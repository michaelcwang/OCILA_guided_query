import { appConfig } from "./config.js";
import { getTemplateById } from "./query-templates.js";

const VISUALIZATION_RE = /^\s*--\s*@visualization:\s*(table|line|bar|metric)\s*\r?\n?/i;

function stripVisualizationDirective(queryText = "") {
  return String(queryText).replace(VISUALIZATION_RE, "");
}

function parseVisualizationDirective(queryText = "") {
  const match = String(queryText).match(VISUALIZATION_RE);
  return match ? match[1].toLowerCase() : null;
}

function normalizeSelectedFields(selectedFields) {
  if (!Array.isArray(selectedFields)) {
    return [];
  }

  return [...new Set(selectedFields.map((item) => String(item || "").trim()).filter(Boolean))];
}

function applySelectedFields(queryText, selectedFields) {
  const normalizedFields = normalizeSelectedFields(selectedFields);
  const strippedQuery = String(queryText).replace(/\s+\|\s+fields\s+[^|]+$/i, "").trim();

  if (!normalizedFields.length) {
    return strippedQuery;
  }

  return `${strippedQuery} | fields ${normalizedFields.join(", ")}`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}

function toIsoStringOrNull(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function buildQueryFromPayload(payload = {}) {
  const {
    templateId,
    logSet,
    field,
    value,
    timeSpan,
    filterText,
    queryText,
    selectedFields
  } = payload;

  let query = stripVisualizationDirective(queryText || "").trim();
  let template = null;
  let source = "manual";

  if (!query) {
    template = getTemplateById(templateId);
    if (!template) {
      throw new Error("Either queryText or a valid templateId is required.");
    }

    if (!logSet) {
      throw new Error("logSet is required when generating from a template.");
    }

    query = template.queryBuilder({
      logSet,
      field,
      value,
      timeSpan,
      filterText
    });
    source = "template";
  }

  query = applySelectedFields(query, selectedFields);

  if (!query) {
    throw new Error("Generated query is empty.");
  }

  return {
    query,
    querySource: source,
    template,
    visualization: parseVisualizationDirective(queryText || ""),
    selectedFields: normalizeSelectedFields(selectedFields)
  };
}

export function buildCliRequest(payload = {}) {
  const {
    namespaceName,
    compartmentId,
    subSystem = "LOG",
    timeStart,
    timeEnd,
    timezone,
    shouldRunAsync,
    asyncMode,
    shouldIncludeColumns,
    shouldIncludeFields,
    shouldIncludeTotalCount,
    shouldUseAcceleration,
    compartmentIdInSubtree,
    limit,
    maxTotalCount,
    queryTimeoutInSeconds
  } = payload;

  const cliRequest = {
    compartmentId: compartmentId || appConfig.compartmentId || "<OCI_LOG_ANALYTICS_COMPARTMENT_OCID>",
    namespaceName: namespaceName || appConfig.namespace || "<OCI_LOG_ANALYTICS_NAMESPACE>",
    queryString: payload.queryText,
    subSystem
  };

  const normalizedTimeStart = toIsoStringOrNull(timeStart);
  const normalizedTimeEnd = toIsoStringOrNull(timeEnd);

  if (normalizedTimeStart) {
    cliRequest.timeStart = normalizedTimeStart;
  }
  if (normalizedTimeEnd) {
    cliRequest.timeEnd = normalizedTimeEnd;
  }
  if (timezone) {
    cliRequest.timezone = timezone;
  }
  if (typeof shouldRunAsync === "boolean") {
    cliRequest.shouldRunAsync = shouldRunAsync;
  }
  if (asyncMode) {
    cliRequest.asyncMode = asyncMode;
  }
  if (typeof shouldIncludeColumns === "boolean") {
    cliRequest.shouldIncludeColumns = shouldIncludeColumns;
  }
  if (typeof shouldIncludeFields === "boolean") {
    cliRequest.shouldIncludeFields = shouldIncludeFields;
  }
  if (typeof shouldIncludeTotalCount === "boolean") {
    cliRequest.shouldIncludeTotalCount = shouldIncludeTotalCount;
  }
  if (typeof shouldUseAcceleration === "boolean") {
    cliRequest.shouldUseAcceleration = shouldUseAcceleration;
  }
  if (typeof compartmentIdInSubtree === "boolean") {
    cliRequest.compartmentIdInSubtree = compartmentIdInSubtree;
  }
  if (Number.isFinite(limit)) {
    cliRequest.limit = limit;
  }
  if (Number.isFinite(maxTotalCount)) {
    cliRequest.maxTotalCount = maxTotalCount;
  }
  if (Number.isFinite(queryTimeoutInSeconds)) {
    cliRequest.queryTimeoutInSeconds = queryTimeoutInSeconds;
  }

  const inlineParts = [
    "oci log-analytics query search",
    `--compartment-id ${shellQuote(cliRequest.compartmentId)}`,
    `--namespace-name ${shellQuote(cliRequest.namespaceName)}`,
    `--query-string ${shellQuote(cliRequest.queryString)}`,
    `--sub-system ${shellQuote(cliRequest.subSystem)}`
  ];

  if (cliRequest.timeStart) {
    inlineParts.push(`--time-start ${shellQuote(cliRequest.timeStart)}`);
  }
  if (cliRequest.timeEnd) {
    inlineParts.push(`--time-end ${shellQuote(cliRequest.timeEnd)}`);
  }
  if (cliRequest.timezone) {
    inlineParts.push(`--timezone ${shellQuote(cliRequest.timezone)}`);
  }
  if (typeof cliRequest.shouldRunAsync === "boolean") {
    inlineParts.push(`--should-run-async ${cliRequest.shouldRunAsync}`);
  }
  if (cliRequest.asyncMode) {
    inlineParts.push(`--async-mode ${shellQuote(cliRequest.asyncMode)}`);
  }
  if (typeof cliRequest.shouldIncludeColumns === "boolean") {
    inlineParts.push(`--should-include-columns ${cliRequest.shouldIncludeColumns}`);
  }
  if (typeof cliRequest.shouldIncludeFields === "boolean") {
    inlineParts.push(`--should-include-fields ${cliRequest.shouldIncludeFields}`);
  }
  if (typeof cliRequest.shouldIncludeTotalCount === "boolean") {
    inlineParts.push(`--should-include-total-count ${cliRequest.shouldIncludeTotalCount}`);
  }
  if (typeof cliRequest.shouldUseAcceleration === "boolean") {
    inlineParts.push(`--should-use-acceleration ${cliRequest.shouldUseAcceleration}`);
  }
  if (typeof cliRequest.compartmentIdInSubtree === "boolean") {
    inlineParts.push(`--compartment-id-in-subtree ${cliRequest.compartmentIdInSubtree}`);
  }
  if (typeof cliRequest.limit === "number") {
    inlineParts.push(`--limit ${cliRequest.limit}`);
  }
  if (typeof cliRequest.maxTotalCount === "number") {
    inlineParts.push(`--max-total-count ${cliRequest.maxTotalCount}`);
  }
  if (typeof cliRequest.queryTimeoutInSeconds === "number") {
    inlineParts.push(`--query-timeout-in-seconds ${cliRequest.queryTimeoutInSeconds}`);
  }

  return {
    cliRequest,
    inlineCommand: inlineParts.join(" "),
    fromJsonCommand: "oci log-analytics query search --from-json file://ocila-query-request.json"
  };
}
