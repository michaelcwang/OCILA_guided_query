import { appConfig } from "./config.js";
import { getTemplateById } from "./query-templates.js";

const VISUALIZATION_RE = /^\s*--\s*@visualization:\s*(table|line|bar|metric)\s*\r?\n?/i;
const MAX_QUERY_LENGTH = 12000;
const MAX_FILTER_LENGTH = 1000;
const MAX_VALUE_LENGTH = 2000;
const MAX_SELECTED_FIELDS = 100;
const MAX_FIELD_NAME_LENGTH = 160;
const MAX_TIME_RANGE_DAYS = 31;
const ALLOWED_TIME_SPANS = new Set(["1minute", "5minute", "15minute", "1hour"]);
const ALLOWED_SUB_SYSTEMS = new Set(["LOG"]);
const ALLOWED_ASYNC_MODES = new Set(["AUTO", "FORCE_SYNCHRONOUS", "FORCE_ASYNCHRONOUS"]);

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function asLimitedString(value, label, maxLength, { required = false } = {}) {
  if (value == null) {
    if (required) {
      throw validationError(`${label} is required.`);
    }
    return "";
  }

  if (typeof value !== "string") {
    throw validationError(`${label} must be a string.`);
  }

  const normalized = value.trim();
  if (required && !normalized) {
    throw validationError(`${label} is required.`);
  }
  if (normalized.length > maxLength) {
    throw validationError(`${label} must be ${maxLength} characters or fewer.`);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) {
    throw validationError(`${label} contains unsupported control characters.`);
  }

  return normalized;
}

function normalizeFilterText(value) {
  const filterText = asLimitedString(value, "filterText", MAX_FILTER_LENGTH);
  if (!filterText) {
    return "";
  }
  if (/[|\r\n;]/.test(filterText)) {
    throw validationError("filterText must be a single filter expression without pipes, newlines, or semicolons.");
  }

  return filterText;
}

function normalizeTimeSpan(value) {
  const timeSpan = asLimitedString(value || "1minute", "timeSpan", 32);
  if (!ALLOWED_TIME_SPANS.has(timeSpan)) {
    throw validationError("timeSpan must be one of 1minute, 5minute, 15minute, or 1hour.");
  }

  return timeSpan;
}

function normalizeOptionalDate(value, label) {
  if (!value) {
    return null;
  }

  if (typeof value !== "string") {
    throw validationError(`${label} must be an ISO date string.`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw validationError(`${label} must be a valid date.`);
  }

  return date;
}

function normalizeNumber(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value == null || value === "") {
    return undefined;
  }

  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw validationError(`${label} must be an integer between ${min} and ${max}.`);
  }

  return number;
}

export function validateQueryExecutionPayload(payload = {}) {
  const queryText = asLimitedString(payload.queryText, "queryText", MAX_QUERY_LENGTH, {
    required: true
  });
  const timeStart = normalizeOptionalDate(payload.timeStart, "timeStart");
  const timeEnd = normalizeOptionalDate(payload.timeEnd, "timeEnd");

  if (timeStart && timeEnd) {
    if (timeStart > timeEnd) {
      throw validationError("timeStart must be before timeEnd.");
    }

    const maxRangeMs = MAX_TIME_RANGE_DAYS * 24 * 60 * 60 * 1000;
    if (timeEnd.getTime() - timeStart.getTime() > maxRangeMs) {
      throw validationError(`Query time range cannot exceed ${MAX_TIME_RANGE_DAYS} days.`);
    }
  }

  return {
    queryText,
    timeStart: timeStart?.toISOString(),
    timeEnd: timeEnd?.toISOString()
  };
}

export function validateSuggestPayload(payload = {}) {
  const input = asLimitedString(payload.input, "input", MAX_QUERY_LENGTH);
  const caretPosition = normalizeNumber(payload.caretPosition, "caretPosition", {
    min: 0,
    max: input.length
  });

  return {
    input,
    caretPosition: caretPosition ?? 0
  };
}

function normalizeBuildPayload(payload = {}) {
  return {
    ...payload,
    templateId: asLimitedString(payload.templateId, "templateId", 120),
    logSet: asLimitedString(payload.logSet, "logSet", 2000),
    field: asLimitedString(payload.field, "field", MAX_FIELD_NAME_LENGTH),
    value: asLimitedString(payload.value, "value", MAX_VALUE_LENGTH),
    timeSpan: normalizeTimeSpan(payload.timeSpan),
    filterText: normalizeFilterText(payload.filterText),
    queryText: asLimitedString(payload.queryText, "queryText", MAX_QUERY_LENGTH),
    selectedFields: normalizeSelectedFields(payload.selectedFields)
  };
}

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

  const normalized = selectedFields.map((item) => {
    if (typeof item !== "string") {
      throw validationError("selectedFields entries must be strings.");
    }
    return asLimitedString(item, "selectedFields entry", MAX_FIELD_NAME_LENGTH);
  });

  const unique = [...new Set(normalized.filter(Boolean))];
  if (unique.length > MAX_SELECTED_FIELDS) {
    throw validationError(`selectedFields cannot contain more than ${MAX_SELECTED_FIELDS} entries.`);
  }

  return unique;
}

function escapeQueryValue(value) {
  return value.replaceAll("'", "\\'");
}

function formatFieldReference(fieldName) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(fieldName)
    ? fieldName
    : `'${escapeQueryValue(fieldName)}'`;
}

function applySelectedFields(queryText, selectedFields) {
  const normalizedFields = normalizeSelectedFields(selectedFields);
  const strippedQuery = String(queryText).replace(/\s+\|\s+fields\s+[^|]+$/i, "").trim();

  if (!normalizedFields.length) {
    return strippedQuery;
  }

  return `${strippedQuery} | fields ${normalizedFields.map(formatFieldReference).join(", ")}`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}

export function buildQueryFromPayload(payload = {}, options = {}) {
  const normalizedPayload = normalizeBuildPayload(payload);
  const {
    templateId,
    logSet,
    field,
    value,
    timeSpan,
    filterText,
    queryText,
    selectedFields
  } = normalizedPayload;

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
      filterText,
      availableFields: options.availableFields || []
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
  const queryText = asLimitedString(payload.queryText, "queryText", MAX_QUERY_LENGTH, {
    required: true
  });
  const {
    namespaceName,
    compartmentId,
    subSystem: rawSubSystem = "LOG",
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
  const subSystem = asLimitedString(rawSubSystem, "subSystem", 24).toUpperCase();
  if (!ALLOWED_SUB_SYSTEMS.has(subSystem)) {
    throw validationError("subSystem must be LOG.");
  }

  const asyncModeValue = asLimitedString(asyncMode, "asyncMode", 64);
  if (asyncModeValue && !ALLOWED_ASYNC_MODES.has(asyncModeValue)) {
    throw validationError(`asyncMode must be one of ${[...ALLOWED_ASYNC_MODES].join(", ")}.`);
  }
  const normalizedLimit = normalizeNumber(limit, "limit", { min: 1, max: 1000 });
  const normalizedMaxTotalCount = normalizeNumber(maxTotalCount, "maxTotalCount", {
    min: 1,
    max: 5000
  });
  const normalizedTimeout = normalizeNumber(queryTimeoutInSeconds, "queryTimeoutInSeconds", {
    min: 1,
    max: 300
  });

  const cliRequest = {
    compartmentId:
      asLimitedString(compartmentId, "compartmentId", 255) ||
      appConfig.compartmentId ||
      "<OCI_LOG_ANALYTICS_COMPARTMENT_OCID>",
    namespaceName:
      asLimitedString(namespaceName, "namespaceName", 255) ||
      appConfig.namespace ||
      "<OCI_LOG_ANALYTICS_NAMESPACE>",
    queryString: queryText,
    subSystem
  };

  const normalizedTimeStart = normalizeOptionalDate(timeStart, "timeStart")?.toISOString();
  const normalizedTimeEnd = normalizeOptionalDate(timeEnd, "timeEnd")?.toISOString();

  if (normalizedTimeStart && normalizedTimeEnd && normalizedTimeStart > normalizedTimeEnd) {
    throw validationError("timeStart must be before timeEnd.");
  }

  if (normalizedTimeStart) {
    cliRequest.timeStart = normalizedTimeStart;
  }
  if (normalizedTimeEnd) {
    cliRequest.timeEnd = normalizedTimeEnd;
  }
  const normalizedTimezone = asLimitedString(timezone, "timezone", 128);
  if (normalizedTimezone) {
    cliRequest.timezone = normalizedTimezone;
  }
  if (typeof shouldRunAsync === "boolean") {
    cliRequest.shouldRunAsync = shouldRunAsync;
  }
  if (asyncModeValue) {
    cliRequest.asyncMode = asyncModeValue;
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
  if (normalizedLimit) {
    cliRequest.limit = normalizedLimit;
  }
  if (normalizedMaxTotalCount) {
    cliRequest.maxTotalCount = normalizedMaxTotalCount;
  }
  if (normalizedTimeout) {
    cliRequest.queryTimeoutInSeconds = normalizedTimeout;
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
