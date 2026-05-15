const QUERY_HISTORY_KEY = "ocila-guided-query-history-v1";
const HISTORY_LIMIT = 25;
const FIELD_CATALOG_LIMIT = 200;
const TRAINING_GUIDE_DEBOUNCE_MS = 180;
const FIELD_CATALOG_DEBOUNCE_MS = 120;
const VISUALIZATION_RE = /^\s*--\s*@visualization:\s*(table|line|bar|metric)\s*\r?\n?/i;
const QUERY_INTENT_HINTS = [
  {
    label: "Fusion order validation",
    patterns: ["orders submitted", "orchestration steps processed", "salesordersfororderhub"]
  },
  {
    label: "Fusion order throughput",
    patterns: ["status = '201'", "method = post", "dsp operations on orders"]
  },
  {
    label: "Slow database queries",
    patterns: ["elapsed time", "sql_id", "avg elapsed"]
  },
  {
    label: "Database connection trend",
    patterns: ["distinctcount('session id')", "active sessions"]
  },
  {
    label: "Blocking session analysis",
    patterns: ["blockingsession", "blocked sessions", "victims"]
  },
  {
    label: "Database ID lookup",
    patterns: ["databaseid", "dbsystemid", "| fields time"]
  },
  {
    label: "API endpoint correlation",
    patterns: ["uri like", "correlated requests", "avg(duration)"]
  }
];
const INLINE_HELP = {
  logSet: {
    title: "Log Set / Pod",
    body: [
      "Use this as the first scope boundary. It should identify the pod, environment, or log collection you want to investigate.",
      "You can enter multiple pods as a comma-separated list. The query builder will turn that into an OR filter across Log Set values.",
      "Starting with the wrong pod is one of the fastest ways to get misleading counts and false correlations.",
      "If you are comparing environments, save separate queries per pod instead of mixing them."
    ]
  },
  template: {
    title: "Investigation Goal",
    body: [
      "Templates are training wheels plus a starting query. They are meant to answer a specific operational question, not just return raw data.",
      "Choose the template that is closest to the symptom you are troubleshooting, then refine with filters and fields."
    ]
  },
  field: {
    title: "Focused Lookup Field",
    body: [
      "This is the field you want to anchor on when searching for a specific database ID, endpoint, user, host, or other dimension.",
      "Good lookup fields are indexed or facet-eligible because they narrow the result set quickly."
    ]
  },
  fieldValue: {
    title: "Field Value",
    body: [
      "Use this for the exact ID or pattern you care about, such as a database identifier, URI prefix, or host name.",
      "When the value varies but shares a common prefix, use a pattern-friendly field and let the generated query use like matching."
    ]
  },
  timeBucket: {
    title: "Time Bucket",
    body: [
      "Short buckets show spikes and bursts. Larger buckets smooth the noise and are better for longer investigations.",
      "If a trend looks flat, the bucket may be too large and averaging away the signal."
    ]
  },
  filterText: {
    title: "Extra Filter Text",
    body: [
      "Use this for small targeted constraints after the template is built, such as one Log Source, Status, DBName, or Host.",
      "Prefer narrow filters first. Over-filtering too early can hide the signal you are trying to learn from."
    ]
  },
  visualization: {
    title: "Visualization",
    body: [
      "Visualization is stored as a local directive in the editor so the app can remember how to display the results.",
      "The directive is stripped before the OCILA query runs, so it does not rely on OCILA understanding chart syntax."
    ]
  },
  customFields: {
    title: "Custom Field Selection",
    body: [
      "Use this catalog to choose fields you want kept in the result output or emphasized in your analysis.",
      "Indexed, facet-eligible, summarizable, and metric-eligible tags help you choose fields that are more useful operationally."
    ]
  },
  sensitiveData: {
    title: "Sensitive Data / PII",
    body: [
      "Treat masking as an ingestion and source-design concern, not a last-minute query concern.",
      "If sensitive values are already indexed in clear text, query design alone is not sufficient protection.",
      "Use dedicated log groups, strict IAM, and source-side masking for high-risk logs."
    ]
  }
};

const state = {
  logSets: [],
  fields: [],
  fieldCatalogIndex: [],
  templates: [],
  fieldSummary: null,
  mockMode: true,
  selectedFields: [],
  savedQueries: [],
  templateGuides: [],
  glossaryEntries: []
};

const els = {
  modeBadge: document.querySelector("#modeBadge"),
  healthBadge: document.querySelector("#healthBadge"),
  refreshButton: document.querySelector("#refreshButton"),
  logSetInput: document.querySelector("#logSetInput"),
  logSetOptions: document.querySelector("#logSetOptions"),
  templateSelect: document.querySelector("#templateSelect"),
  fieldSelect: document.querySelector("#fieldSelect"),
  fieldValueInput: document.querySelector("#fieldValueInput"),
  timeSpanSelect: document.querySelector("#timeSpanSelect"),
  filterTextInput: document.querySelector("#filterTextInput"),
  visualizationSelect: document.querySelector("#visualizationSelect"),
  buildButton: document.querySelector("#buildButton"),
  runButton: document.querySelector("#runButton"),
  saveQueryButton: document.querySelector("#saveQueryButton"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  analyzeQueryButton: document.querySelector("#analyzeQueryButton"),
  copyQueryButton: document.querySelector("#copyQueryButton"),
  refreshAutomationButton: document.querySelector("#refreshAutomationButton"),
  copyApiPayloadButton: document.querySelector("#copyApiPayloadButton"),
  copyCliCommandButton: document.querySelector("#copyCliCommandButton"),
  queryEditor: document.querySelector("#queryEditor"),
  automationMeta: document.querySelector("#automationMeta"),
  apiPayloadOutput: document.querySelector("#apiPayloadOutput"),
  cliCommandOutput: document.querySelector("#cliCommandOutput"),
  suggestButton: document.querySelector("#suggestButton"),
  suggestedFields: document.querySelector("#suggestedFields"),
  applyFieldsButton: document.querySelector("#applyFieldsButton"),
  fieldSummaryText: document.querySelector("#fieldSummaryText"),
  fieldSearchInput: document.querySelector("#fieldSearchInput"),
  fieldOptionFilter: document.querySelector("#fieldOptionFilter"),
  selectedFields: document.querySelector("#selectedFields"),
  fieldCatalog: document.querySelector("#fieldCatalog"),
  suggestions: document.querySelector("#suggestions"),
  historyList: document.querySelector("#historyList"),
  templateHelp: document.querySelector("#templateHelp"),
  glossaryHelp: document.querySelector("#glossaryHelp"),
  sensitiveDataNote: document.querySelector("#sensitiveDataNote"),
  helpDialog: document.querySelector("#helpDialog"),
  helpDialogTitle: document.querySelector("#helpDialogTitle"),
  helpDialogBody: document.querySelector("#helpDialogBody"),
  closeHelpDialogButton: document.querySelector("#closeHelpDialogButton"),
  queryAnalysis: document.querySelector("#queryAnalysis"),
  chartWrap: document.querySelector("#chartWrap"),
  resultsMeta: document.querySelector("#resultsMeta"),
  resultsTableWrap: document.querySelector("#resultsTableWrap"),
  timeStartInput: document.querySelector("#timeStartInput"),
  timeEndInput: document.querySelector("#timeEndInput")
};

function setStatus(text, mutedText) {
  els.modeBadge.textContent = text;
  els.healthBadge.textContent = mutedText;
}

function formatNowRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60 * 1000);
  els.timeStartInput.value = toDateTimeLocalValue(start);
  els.timeEndInput.value = toDateTimeLocalValue(end);
}

function toDateTimeLocalValue(date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function formatSavedAt(timestamp) {
  return new Date(timestamp).toLocaleString();
}

function parseVisualizationDirective(queryText) {
  const match = queryText.match(VISUALIZATION_RE);
  return match ? match[1].toLowerCase() : null;
}

function stripVisualizationDirective(queryText) {
  return queryText.replace(VISUALIZATION_RE, "");
}

function escapeQueryValue(value) {
  return value.replaceAll("'", "\\'");
}

function formatFieldReference(fieldName) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(fieldName)
    ? fieldName
    : `'${escapeQueryValue(fieldName)}'`;
}

function applyVisualizationDirective(queryText, visualization) {
  return `-- @visualization: ${visualization}\n${stripVisualizationDirective(queryText).trimStart()}`;
}

function syncVisualizationSelectionFromEditor() {
  const visualization = parseVisualizationDirective(els.queryEditor.value);
  if (visualization) {
    els.visualizationSelect.value = visualization;
  }
}

function currentVisualization() {
  return parseVisualizationDirective(els.queryEditor.value) || els.visualizationSelect.value;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeToken(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll(/['"`]/g, "")
    .replaceAll(/[^a-z0-9]/g, "");
}

function debounce(fn, waitMs) {
  let timeoutId = null;

  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      fn(...args);
    }, waitMs);
  };
}

function splitQueryStages(queryText) {
  const stages = [];
  let current = "";
  let bracketDepth = 0;
  let inQuote = false;

  for (let index = 0; index < queryText.length; index += 1) {
    const char = queryText[index];
    const next = queryText[index + 1];

    if (char === "'" && queryText[index - 1] !== "\\") {
      inQuote = !inQuote;
      current += char;
      continue;
    }

    if (!inQuote) {
      if (char === "[") {
        bracketDepth += 1;
      } else if (char === "]") {
        bracketDepth = Math.max(bracketDepth - 1, 0);
      }

      if (char === "|" && bracketDepth === 0) {
        stages.push(current.trim());
        current = "";
        continue;
      }
    }

    current += char;

    if (char === "\n" && next === "|") {
      continue;
    }
  }

  if (current.trim()) {
    stages.push(current.trim());
  }

  return stages.filter(Boolean);
}

function inferQueryIntent(queryText) {
  const normalized = queryText.toLowerCase();
  const match = QUERY_INTENT_HINTS.find((item) =>
    item.patterns.every((pattern) => normalized.includes(pattern))
  );
  return match?.label || "General scoped aggregation and correlation query";
}

function analyzeQueryText(queryText) {
  const cleanQuery = stripVisualizationDirective(queryText).trim();
  if (!cleanQuery) {
    return null;
  }

  const stages = splitQueryStages(cleanQuery);
  const scopeStage = stages[0] || "";
  const logSets = unique([...scopeStage.matchAll(/'Log Set'\s*=\s*'([^']+)'/gi)].map((match) => match[1]));
  const logSources = unique(
    [...cleanQuery.matchAll(/'Log Source'\s*=\s*([^\s,\]\)]+)/gi)].map((match) =>
      match[1].replace(/^'|'$/g, "")
    )
  );
  const uriPatterns = unique(
    [...cleanQuery.matchAll(/\bURI\s+(?:like|=)\s+'([^']+)'/gi)].map((match) => match[1])
  );
  const timeBucket = cleanQuery.match(/link\s+span\s*=\s*([^\s]+)\s+Time/i)?.[1] || null;
  const addfieldsCount = [...cleanQuery.matchAll(/\baddfields\b/gi)].length;
  const addfieldBlocks = [...cleanQuery.matchAll(/\[[^\]]+\]/g)].length;
  const aggregations = unique(
    [...cleanQuery.matchAll(/\b(distinctcount|count|avg|max|min|sum|values)\s*\(/gi)].map(
      (match) => match[1]
    )
  );
  const groupByFields = unique(
    [...cleanQuery.matchAll(/\bby\s+([^|\]]+)/gi)]
      .flatMap((match) => match[1].split(","))
      .map((item) => item.trim().replace(/^'|'$/g, ""))
  );
  const projectionFields = unique(
    [...cleanQuery.matchAll(/\|\s*fields\s+([^|]+)/gi)]
      .flatMap((match) => match[1].split(","))
      .map((item) => item.trim().replace(/^'|'$/g, ""))
  );
  const sortField = cleanQuery.match(/\bsort\s+([+-])\s*([^|]+?)(?:\s*\||$)/i);
  const headLimit = cleanQuery.match(/\bhead\s+limit\s*=\s*(\d+)/i)?.[1] || null;
  const thresholdFilters = unique(
    [...cleanQuery.matchAll(/\b([A-Za-z_][A-Za-z0-9_ ]*)\s*(>=|<=|>|<)\s*([0-9.]+)/g)].map(
      (match) => `${match[1].trim()} ${match[2]} ${match[3]}`
    )
  );
  const detectedConcepts = detectGlossaryEntries(cleanQuery).map((entry) => entry.term);

  const summaryParts = [];
  if (logSets.length) {
    summaryParts.push(
      logSets.length === 1
        ? `scopes to log set ${logSets[0]}`
        : `scopes to ${logSets.length} log sets`
    );
  }
  if (logSources.length) {
    summaryParts.push(
      logSources.length === 1
        ? `filters one log source`
        : `pulls ${logSources.length} log sources together`
    );
  }
  if (timeBucket) {
    summaryParts.push(`buckets results into ${timeBucket} intervals`);
  }
  if (aggregations.length) {
    summaryParts.push(`aggregates with ${aggregations.join(", ")}`);
  }

  const walkthrough = [];
  walkthrough.push(`Stage count: ${stages.length}. The query is processed in ${stages.length} pipeline stage(s).`);
  if (logSets.length) {
    walkthrough.push(
      `Scope filter: ${logSets.length === 1 ? logSets[0] : logSets.join(", ")}.`
    );
  }
  if (logSources.length) {
    walkthrough.push(`Log source filter: ${logSources.join(", ")}.`);
  }
  if (uriPatterns.length) {
    walkthrough.push(`URI filter: ${uriPatterns.join(", ")}.`);
  }
  if (timeBucket) {
    walkthrough.push(`Time bucketing: link span groups events by ${timeBucket}.`);
  }
  if (addfieldsCount || addfieldBlocks) {
    walkthrough.push(
      `Derived metrics: addfields is used${addfieldBlocks ? ` with ${addfieldBlocks} metric block(s)` : ""}.`
    );
  }
  if (aggregations.length) {
    walkthrough.push(`Aggregations detected: ${aggregations.join(", ")}.`);
  }
  if (groupByFields.length) {
    walkthrough.push(`Grouping fields: ${groupByFields.join(", ")}.`);
  }
  if (projectionFields.length) {
    walkthrough.push(`Projected output fields: ${projectionFields.join(", ")}.`);
  }
  if (sortField) {
    walkthrough.push(
      `Ordering: sorted by ${sortField[2].trim()} ${sortField[1] === "-" ? "DESC" : "ASC"}.`
    );
  }
  if (headLimit) {
    walkthrough.push(`Top-N filter: head ${headLimit} keeps only the leading rows.`);
  }

  const watchouts = [];
  if (logSets.length > 1) {
    watchouts.push("Multiple pods are combined, so differences between pods may be hidden in the aggregate result.");
  }
  if (addfieldBlocks > 3) {
    watchouts.push("This query computes many derived metrics at once, so validate that each metric is comparable at the same time granularity.");
  }
  if (!timeBucket && cleanQuery.includes("stats")) {
    watchouts.push("The query aggregates results but does not bucket by time, so you will get rollups rather than a time trend.");
  }
  if (thresholdFilters.length) {
    watchouts.push(`Threshold filters detected: ${thresholdFilters.join(", ")}.`);
  }
  if (!watchouts.length) {
    watchouts.push("No obvious structural risk was detected. Validate the field names against the actual log source mapping in your tenancy.");
  }

  return {
    intent: inferQueryIntent(cleanQuery),
    summary:
      summaryParts.length > 0
        ? `This query ${summaryParts.join(", ")}.`
        : "This query applies filters and pipeline stages, but the scope is not obvious from the text alone.",
    walkthrough,
    detectedConcepts,
    watchouts
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function populateSelect(selectEl, items, mapper) {
  selectEl.innerHTML = "";

  for (const item of items) {
    const option = document.createElement("option");
    const mapped = mapper(item);
    option.value = mapped.value;
    option.textContent = mapped.label;
    selectEl.append(option);
  }
}

function populateLogSetOptions(items) {
  els.logSetOptions.innerHTML = "";

  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.displayName || item.name;
    els.logSetOptions.append(option);
  }
}

function displayFieldName(field) {
  return field.displayName || field.name;
}

function fieldMatchesOption(field, option) {
  switch (option) {
    case "facet":
      return field.isFacetEligible;
    case "table":
      return field.isTableEligible;
    case "metricKey":
      return field.isMetricKeyEligible;
    case "metricValue":
      return field.isMetricValueEligible;
    case "summarizable":
      return field.isSummarizable;
    case "system":
      return field.isSystem;
    case "custom":
      return !field.isSystem;
    default:
      return true;
  }
}

function buildFieldSearchIndex(fields) {
  return fields.map((field) => {
    const displayName = displayFieldName(field);
    const tags = fieldTags(field);

    return {
      field,
      displayName,
      tags,
      haystack: [
        displayName,
        field.name,
        field.description,
        field.dataType,
        ...tags
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
    };
  });
}

function renderSuggestedFields(template) {
  els.suggestedFields.innerHTML = "";
  for (const field of template?.suggestedFields || []) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.type = "button";
    chip.textContent = field;
    chip.addEventListener("click", () => {
      els.fieldSelect.value = field;
      toggleSelectedField(field, true);
    });
    els.suggestedFields.append(chip);
  }
}

function fieldTags(field) {
  const tags = [];

  if (field.isFacetEligible) {
    tags.push("indexed");
  }
  if (field.isTableEligible) {
    tags.push("table");
  }
  if (field.isMetricKeyEligible) {
    tags.push("metric key");
  }
  if (field.isMetricValueEligible) {
    tags.push("metric value");
  }
  if (field.isSummarizable) {
    tags.push("summarizable");
  }
  if (field.isPrimary) {
    tags.push("primary");
  }
  if (field.isHighCardinality) {
    tags.push("high cardinality");
  }
  if (field.isLargeData) {
    tags.push("large data");
  }
  tags.push(field.isSystem ? "oracle-defined" : "custom");
  if (field.dataType) {
    tags.push(field.dataType.toLowerCase());
  }

  return tags;
}

function renderSelectedFields() {
  if (!state.selectedFields.length) {
    els.selectedFields.className = "chip-row empty-chip-row";
    els.selectedFields.textContent = "No custom fields selected.";
    return;
  }

  els.selectedFields.className = "chip-row";
  els.selectedFields.innerHTML = "";

  for (const fieldName of state.selectedFields) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.type = "button";
    chip.textContent = `${fieldName} ×`;
    chip.addEventListener("click", () => {
      toggleSelectedField(fieldName, false);
    });
    els.selectedFields.append(chip);
  }
}

function renderFieldSummary() {
  const summary = state.fieldSummary;
  const indexedCount = state.fields.filter((field) => field.isFacetEligible).length;

  if (!summary) {
    els.fieldSummaryText.textContent = `${indexedCount} indexed / facet-eligible fields available.`;
    return;
  }

  const systemCount = summary.oobCount || 0;
  const customCount = summary.nonOobCount || 0;
  els.fieldSummaryText.textContent =
    `${indexedCount} indexed / facet-eligible fields, ${systemCount} Oracle-defined fields, ${customCount} custom fields.`;
}

function renderFieldCatalog() {
  const searchTerm = els.fieldSearchInput.value.trim().toLowerCase();
  const option = els.fieldOptionFilter.value;
  const filtered = state.fieldCatalogIndex.filter(
    (entry) => entry.haystack.includes(searchTerm) && fieldMatchesOption(entry.field, option)
  );

  if (!filtered.length) {
    els.fieldCatalog.innerHTML = `<div class="helper-copy">No fields match the current filter.</div>`;
    return;
  }

  els.fieldCatalog.innerHTML = "";
  const fragment = document.createDocumentFragment();
  const limitedFields = filtered.slice(0, FIELD_CATALOG_LIMIT);

  for (const entry of limitedFields) {
    const { field, displayName, tags } = entry;
    const row = document.createElement("label");
    row.className = "field-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.fieldName = displayName;
    checkbox.checked = state.selectedFields.includes(displayName);
    checkbox.addEventListener("change", () => {
      toggleSelectedField(displayName, checkbox.checked);
    });

    const content = document.createElement("div");
    const title = document.createElement("div");
    title.className = "field-name";
    title.textContent = displayName;

    const description = document.createElement("div");
    description.className = "helper-copy";
    description.textContent = field.description || field.name || "";

    content.append(title, description);

    const meta = document.createElement("div");
    meta.className = "field-meta";

    for (const tagText of tags) {
      const tag = document.createElement("span");
      tag.className = "field-tag";
      tag.textContent = tagText;
      meta.append(tag);
    }

    row.append(checkbox, content, meta);
    fragment.append(row);
  }

  els.fieldCatalog.append(fragment);

  if (filtered.length > FIELD_CATALOG_LIMIT) {
    const note = document.createElement("div");
    note.className = "helper-copy";
    note.textContent = `Showing first ${FIELD_CATALOG_LIMIT} matching fields. Refine the search to narrow results.`;
    els.fieldCatalog.append(note);
  }
}

function syncFieldCatalogSelections() {
  els.fieldCatalog.querySelectorAll("input[type='checkbox'][data-field-name]").forEach((checkbox) => {
    checkbox.checked = state.selectedFields.includes(checkbox.dataset.fieldName);
  });
}

function toggleSelectedField(fieldName, shouldSelect) {
  if (shouldSelect) {
    if (!state.selectedFields.includes(fieldName)) {
      state.selectedFields.push(fieldName);
    }
  } else {
    state.selectedFields = state.selectedFields.filter((item) => item !== fieldName);
  }

  renderSelectedFields();
  syncFieldCatalogSelections();
}

function renderSuggestions(items) {
  if (!items.length) {
    els.suggestions.className = "suggestion-list empty";
    els.suggestions.textContent = "No suggestions returned.";
    return;
  }

  els.suggestions.className = "suggestion-list";
  els.suggestions.innerHTML = "";

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "suggestion-item";

    const type = document.createElement("div");
    type.className = "suggestion-type";
    type.textContent = item.type || item.suggestionType || "suggestion";

    const value = document.createElement("div");
    value.textContent =
      item.value || item.displayText || item.fieldName || JSON.stringify(item);

    row.append(type, value);
    row.addEventListener("click", () => {
      const text = value.textContent;
      const editor = els.queryEditor;
      editor.setRangeText(text, editor.selectionStart, editor.selectionEnd, "end");
      editor.focus();
    });
    els.suggestions.append(row);
  }
}

function columnIndex(columns, candidates) {
  const wanted = candidates.map(normalizeToken);
  return columns.findIndex((column) => wanted.includes(normalizeToken(column)));
}

function rowValue(columns, row, candidates) {
  const index = columnIndex(columns, candidates);
  if (index === -1) {
    return null;
  }

  const value = row[index];
  return value == null || value === "" ? null : value;
}

function appendTopLevelFilter(queryText, fieldName, value) {
  const cleanQuery = stripVisualizationDirective(queryText).trim();
  const pipeIndex = cleanQuery.indexOf("|");
  const filter = `${formatFieldReference(fieldName)} = '${escapeQueryValue(String(value))}'`;

  if (pipeIndex === -1) {
    return `${cleanQuery} and ${filter}`;
  }

  const baseFilter = cleanQuery.slice(0, pipeIndex).trim();
  const pipeline = cleanQuery.slice(pipeIndex).trimStart();
  return `${baseFilter} and ${filter} ${pipeline}`;
}

function applyDrilldownQuery(queryText, message) {
  els.queryEditor.value = applyVisualizationDirective(queryText, currentVisualization());
  renderTrainingGuide();
  renderQueryAnalysis();
  refreshAutomationPanel({ silent: true });
  els.resultsMeta.textContent = message;
}

async function buildDatabaseLookupDrilldown(fieldName, value) {
  const data = await fetchJson("/api/template-query", {
    method: "POST",
    body: JSON.stringify({
      templateId: "database-id-lookup",
      logSet: els.logSetInput.value.trim(),
      field: fieldName,
      value: String(value),
      filterText: els.filterTextInput.value
    })
  });

  els.templateSelect.value = "database-id-lookup";
  if ([...els.fieldSelect.options].some((option) => option.value === fieldName)) {
    els.fieldSelect.value = fieldName;
  }
  els.fieldValueInput.value = String(value);
  applyDrilldownQuery(data.query, `Drill-down prepared for ${fieldName} = ${value}.`);
  els.resultsMeta.textContent = `Drill-down prepared for ${fieldName} = ${value}.`;
}

function drilldownActionsForRow(columns, row) {
  const templateId = els.templateSelect.value;
  const actions = [];

  if (templateId === "slow-db-queries") {
    const sqlId = rowValue(columns, row, ["SQL_ID", "SQL ID"]);
    if (sqlId) {
      actions.push({
        label: "SQL",
        title: `Filter current query to SQL_ID ${sqlId}`,
        run: () => {
          applyDrilldownQuery(
            appendTopLevelFilter(els.queryEditor.value, "SQL_ID", sqlId),
            `Drill-down prepared for SQL_ID = ${sqlId}.`
          );
        }
      });
    }
  }

  if (templateId === "blocking-sessions") {
    const blocker = rowValue(columns, row, [
      "BlockingSession",
      "Blocking Session",
      "Blocking Session ID",
      "Blocking SID"
    ]);
    if (blocker) {
      actions.push({
        label: "Blocker",
        title: `Filter current query to blocker ${blocker}`,
        run: () => {
          const blockerColumn = columns[columnIndex(columns, [
            "BlockingSession",
            "Blocking Session",
            "Blocking Session ID",
            "Blocking SID"
          ])];
          applyDrilldownQuery(
            appendTopLevelFilter(els.queryEditor.value, blockerColumn || "BlockingSession", blocker),
            `Drill-down prepared for blocker ${blocker}.`
          );
        }
      });
    }
  }

  for (const [fieldName, candidates] of [
    ["DatabaseId", ["DatabaseId", "Database ID"]],
    ["DBSystemId", ["DBSystemId", "DB System ID"]],
    ["DBName", ["DBName", "DB Name", "Database Name"]]
  ]) {
    const value = rowValue(columns, row, candidates);
    if (value) {
      actions.push({
        label: fieldName,
        title: `Build database lookup for ${fieldName} ${value}`,
        run: () => buildDatabaseLookupDrilldown(fieldName, value)
      });
      break;
    }
  }

  return actions;
}

function renderTable(columns, rows) {
  if (!rows.length) {
    els.resultsTableWrap.className = "results-table-wrap empty";
    els.resultsTableWrap.textContent = "No rows returned.";
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const headRow = document.createElement("tr");
  const hasDrilldowns = rows.some((row) => drilldownActionsForRow(columns, row).length);

  for (const column of columns) {
    const th = document.createElement("th");
    th.textContent = column;
    headRow.append(th);
  }

  if (hasDrilldowns) {
    const th = document.createElement("th");
    th.textContent = "Drill Down";
    headRow.append(th);
  }

  thead.append(headRow);

  for (const row of rows) {
    const tr = document.createElement("tr");

    for (const value of row) {
      const td = document.createElement("td");
      td.textContent = value == null ? "" : String(value);
      tr.append(td);
    }

    if (hasDrilldowns) {
      const td = document.createElement("td");
      const actions = drilldownActionsForRow(columns, row);
      if (actions.length) {
        const actionRow = document.createElement("div");
        actionRow.className = "row-action-list";
        for (const action of actions) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "row-action-button";
          button.textContent = action.label;
          button.title = action.title;
          button.addEventListener("click", async () => {
            try {
              await action.run();
            } catch (error) {
              els.resultsMeta.textContent = error.message;
            }
          });
          actionRow.append(button);
        }
        td.append(actionRow);
      }
      tr.append(td);
    }

    tbody.append(tr);
  }

  table.append(thead, tbody);
  els.resultsTableWrap.className = "results-table-wrap";
  els.resultsTableWrap.innerHTML = "";
  els.resultsTableWrap.append(table);
}

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const normalized = Number(value.replaceAll(",", ""));
    return Number.isFinite(normalized) ? normalized : null;
  }

  return null;
}

function renderChartMessage(message) {
  els.chartWrap.className = "chart-wrap empty";
  els.chartWrap.textContent = message;
}

function renderMetricCards(columns, rows) {
  const latestRow = rows.at(-1) || [];
  const numericColumns = columns
    .map((column, index) => ({ column, index, value: parseNumber(latestRow[index]) }))
    .filter((item) => item.value != null);

  if (!numericColumns.length) {
    renderChartMessage("Metric view needs at least one numeric column.");
    return;
  }

  const grid = document.createElement("div");
  grid.className = "metric-grid";

  for (const item of numericColumns.slice(0, 8)) {
    const card = document.createElement("div");
    card.className = "metric-card";

    const name = document.createElement("div");
    name.className = "metric-name";
    name.textContent = item.column;

    const value = document.createElement("div");
    value.className = "metric-value";
    value.textContent = item.value.toLocaleString();

    card.append(name, value);
    grid.append(card);
  }

  els.chartWrap.className = "chart-wrap";
  els.chartWrap.innerHTML = "";
  els.chartWrap.append(grid);
}

function renderSeriesChart(columns, rows, type) {
  const numericIndex = columns.findIndex((_, index) =>
    rows.some((row) => parseNumber(row[index]) != null)
  );

  if (numericIndex === -1) {
    renderChartMessage(`${type} chart needs at least one numeric column.`);
    return;
  }

  const xIndex = numericIndex === 0 ? 1 : 0;
  if (xIndex >= columns.length) {
    renderChartMessage(`${type} chart needs one label column and one numeric column.`);
    return;
  }

  const series = rows
    .map((row) => ({
      label: row[xIndex] == null ? "" : String(row[xIndex]),
      value: parseNumber(row[numericIndex])
    }))
    .filter((point) => point.value != null)
    .slice(0, 24);

  if (!series.length) {
    renderChartMessage(`${type} chart could not derive numeric values from the results.`);
    return;
  }

  const width = 760;
  const height = 260;
  const margin = { top: 20, right: 20, bottom: 64, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(...series.map((point) => point.value), 1);

  const svg = createSvgElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    class: "chart-svg",
    role: "img",
    "aria-label": `${type} chart`
  });

  for (let step = 0; step <= 4; step += 1) {
    const y = margin.top + (plotHeight / 4) * step;
    svg.append(
      createSvgElement("line", {
        x1: margin.left,
        y1: y,
        x2: width - margin.right,
        y2: y,
        class: "chart-grid-line"
      })
    );
  }

  svg.append(
    createSvgElement("line", {
      x1: margin.left,
      y1: margin.top,
      x2: margin.left,
      y2: height - margin.bottom,
      class: "chart-axis"
    })
  );
  svg.append(
    createSvgElement("line", {
      x1: margin.left,
      y1: height - margin.bottom,
      x2: width - margin.right,
      y2: height - margin.bottom,
      class: "chart-axis"
    })
  );

  if (type === "line") {
    const path = createSvgElement("path", { class: "chart-line" });
    const d = series
      .map((point, index) => {
        const x =
          margin.left + (series.length === 1 ? plotWidth / 2 : (plotWidth / (series.length - 1)) * index);
        const y = margin.top + plotHeight - (point.value / maxValue) * plotHeight;
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
    path.setAttribute("d", d);
    svg.append(path);

    series.forEach((point, index) => {
      const x =
        margin.left + (series.length === 1 ? plotWidth / 2 : (plotWidth / (series.length - 1)) * index);
      const y = margin.top + plotHeight - (point.value / maxValue) * plotHeight;
      svg.append(createSvgElement("circle", { cx: x, cy: y, r: 4, class: "chart-point" }));
    });
  } else {
    const barWidth = plotWidth / series.length;
    series.forEach((point, index) => {
      const heightValue = (point.value / maxValue) * plotHeight;
      svg.append(
        createSvgElement("rect", {
          x: margin.left + index * barWidth + 6,
          y: margin.top + plotHeight - heightValue,
          width: Math.max(barWidth - 12, 8),
          height: heightValue,
          rx: 4,
          class: "chart-bar"
        })
      );
    });
  }

  const sampledIndexes = new Set();
  const labelCount = Math.min(series.length, 6);
  for (let i = 0; i < labelCount; i += 1) {
    sampledIndexes.add(Math.round((series.length - 1) * (i / Math.max(labelCount - 1, 1))));
  }

  series.forEach((point, index) => {
    if (!sampledIndexes.has(index)) {
      return;
    }

    const x =
      type === "line"
        ? margin.left + (series.length === 1 ? plotWidth / 2 : (plotWidth / (series.length - 1)) * index)
        : margin.left + (plotWidth / series.length) * index + plotWidth / series.length / 2;
    const text = createSvgElement("text", {
      x,
      y: height - 26,
      "text-anchor": "middle",
      class: "chart-label"
    });
    text.textContent = point.label.slice(0, 16);
    svg.append(text);
  });

  const yLabel = createSvgElement("text", {
    x: margin.left - 10,
    y: margin.top + 10,
    "text-anchor": "end",
    class: "chart-label"
  });
  yLabel.textContent = columns[numericIndex];
  svg.append(yLabel);

  els.chartWrap.className = "chart-wrap";
  els.chartWrap.innerHTML = "";
  els.chartWrap.append(svg);
}

function renderVisualization(columns, rows) {
  const visualization = currentVisualization();

  if (!rows.length) {
    renderChartMessage("Run a query to render a visualization.");
    return;
  }

  if (visualization === "table") {
    renderChartMessage("Table-only view selected.");
    return;
  }

  if (visualization === "metric") {
    renderMetricCards(columns, rows);
    return;
  }

  renderSeriesChart(columns, rows, visualization);
}

function currentTemplate() {
  return state.templates.find((item) => item.id === els.templateSelect.value);
}

function currentTemplateGuide() {
  return state.templateGuides.find((item) => item.id === els.templateSelect.value) || null;
}

function detectGlossaryEntries(queryText) {
  const normalized = queryText.toLowerCase();
  return state.glossaryEntries.filter((entry) =>
    (entry.aliases || []).some((alias) => normalized.includes(alias.toLowerCase()))
  );
}

function renderHelpList(items) {
  if (!items?.length) {
    return `<p class="helper-copy">No items yet.</p>`;
  }

  return `<ul class="help-list">${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}

function renderReadingSteps(steps) {
  if (!steps?.length) {
    return `<p class="helper-copy">No walkthrough is available for this template yet.</p>`;
  }

  return `<div class="help-section">${steps
    .map(
      (step) => `
        <div>
          <div class="help-title">${escapeHtml(step.label)}</div>
          <div class="helper-copy">${escapeHtml(step.explanation)}</div>
        </div>
      `
    )
    .join("")}</div>`;
}

function renderTemplateHelp() {
  const guide = currentTemplateGuide();

  if (!guide) {
    els.templateHelp.innerHTML = `<div class="helper-copy">No template-specific help is available yet.</div>`;
    return;
  }

  els.templateHelp.innerHTML = `
    <div class="help-section">
      <div class="help-title">What This Query Helps You Answer</div>
      <div class="helper-copy">${escapeHtml(guide.analystGoal)}</div>
    </div>
    <div class="help-section">
      <div class="help-title">Use It When</div>
      ${renderHelpList(guide.useWhen)}
    </div>
    <div class="help-section">
      <div class="help-title">How To Read The Query</div>
      ${renderReadingSteps(guide.readingSteps)}
    </div>
    <div class="help-section">
      <div class="help-title">Signals To Watch</div>
      ${renderHelpList(guide.signals)}
    </div>
    <div class="help-section">
      <div class="help-title">Suggested Follow-Up</div>
      ${renderHelpList(guide.followUps)}
    </div>
  `;
}

function renderGlossaryHelp() {
  const detected = detectGlossaryEntries(stripVisualizationDirective(els.queryEditor.value));

  if (!detected.length) {
    els.glossaryHelp.innerHTML = `
      <div class="help-title">Detected Query Concepts</div>
      <div class="helper-copy">Build or edit a query to see operator explanations here.</div>
    `;
    return;
  }

  els.glossaryHelp.innerHTML = `
    <div class="help-title">Detected Query Concepts</div>
    ${detected
      .map(
        (entry) => `
          <div class="glossary-term">
            <div class="help-title">${escapeHtml(entry.term)} <span class="helper-copy">(${escapeHtml(
              entry.category
            )})</span></div>
            <div class="helper-copy">${escapeHtml(entry.description)}</div>
          </div>
        `
      )
      .join("")}
  `;
}

function renderTrainingGuide() {
  renderTemplateHelp();
  renderGlossaryHelp();
}

function renderQueryAnalysis() {
  const analysis = analyzeQueryText(els.queryEditor.value);

  if (!analysis) {
    els.queryAnalysis.innerHTML = `
      <div class="help-title">Query Analysis</div>
      <div class="helper-copy">
        Paste an OCILA query into the editor and click Explain Query to get a plain-English breakdown.
      </div>
    `;
    return;
  }

  els.queryAnalysis.innerHTML = `
    <div class="help-section">
      <div class="help-title">Likely Purpose</div>
      <div class="helper-copy">${escapeHtml(analysis.intent)}</div>
    </div>
    <div class="help-section">
      <div class="help-title">Plain-English Summary</div>
      <div class="helper-copy">${escapeHtml(analysis.summary)}</div>
    </div>
    <div class="help-section">
      <div class="help-title">What The Query Is Doing</div>
      <ul class="help-inline-list">
        ${analysis.walkthrough.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
    <div class="help-section">
      <div class="help-title">Detected Concepts</div>
      ${
        analysis.detectedConcepts.length
          ? `<div class="helper-copy">${escapeHtml(analysis.detectedConcepts.join(", "))}</div>`
          : `<div class="helper-copy">No glossary concepts were detected yet.</div>`
      }
    </div>
    <div class="help-section">
      <div class="help-title">Watch-Outs</div>
      <ul class="help-inline-list">
        ${analysis.watchouts.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderSensitiveDataNote() {
  els.sensitiveDataNote.innerHTML = `
    <div class="help-title">Mask before analysts query it</div>
    <div class="helper-copy">
      OCILA query text in this app is for analysis, not for retroactive redaction. Use source-side data
      filters and masking policy for logs that may contain PII, secrets, or regulated identifiers.
    </div>
    <div class="helper-copy">
      This app will surface guidance and training, but it does not replace ingestion-time masking or IAM
      controls.
    </div>
  `;
}

function openHelpDialog(helpKey) {
  const item = INLINE_HELP[helpKey];
  if (!item) {
    return;
  }

  els.helpDialogTitle.textContent = item.title;
  els.helpDialogBody.innerHTML = item.body
    .map((paragraph) => `<div class="helper-copy">${escapeHtml(paragraph)}</div>`)
    .join("");
  els.helpDialog.showModal();
}

function currentUiPayload() {
  return {
    templateId: els.templateSelect.value,
    logSet: els.logSetInput.value.trim(),
    field: els.fieldSelect.value,
    value: els.fieldValueInput.value,
    timeSpan: els.timeSpanSelect.value,
    filterText: els.filterTextInput.value,
    queryText: els.queryEditor.value,
    selectedFields: [...state.selectedFields],
    timeStart: els.timeStartInput.value ? new Date(els.timeStartInput.value).toISOString() : undefined,
    timeEnd: els.timeEndInput.value ? new Date(els.timeEndInput.value).toISOString() : undefined,
    shouldIncludeColumns: true,
    shouldIncludeFields: true
  };
}

function renderAutomationPanel(data = null) {
  if (!data) {
    els.automationMeta.textContent = "Build a query, then generate an API payload and OCI CLI command.";
    els.apiPayloadOutput.value = "";
    els.cliCommandOutput.value = "";
    return;
  }

  els.automationMeta.textContent =
    `Source: ${data.querySource}. Save cli.cliRequest as ocila-query-request.json, then run the command below.`;
  els.apiPayloadOutput.value = JSON.stringify(data.cli.cliRequest, null, 2);
  els.cliCommandOutput.value =
    `${data.cli.fromJsonCommand}\n\nInline alternative:\n${data.cli.inlineCommand}`;
}

async function refreshAutomationPanel(options = {}) {
  const { silent = false } = options;

  try {
    const data = await fetchJson("/api/cli-query", {
      method: "POST",
      body: JSON.stringify(currentUiPayload())
    });
    renderAutomationPanel(data);
  } catch (error) {
    if (!silent) {
      els.automationMeta.textContent = error.message;
    }
    els.apiPayloadOutput.value = "";
    els.cliCommandOutput.value = "";
  }
}

async function copyOutputValue(textarea, label) {
  const value = textarea.value.trim();
  if (!value) {
    els.automationMeta.textContent = `Nothing to copy for ${label.toLowerCase()}.`;
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
  } else {
    textarea.removeAttribute("readonly");
    textarea.select();
    document.execCommand("copy");
    textarea.setAttribute("readonly", "readonly");
  }

  els.automationMeta.textContent = `${label} copied to clipboard.`;
}

async function copyGeneratedQuery() {
  const queryText = stripVisualizationDirective(els.queryEditor.value).trim();
  if (!queryText) {
    els.resultsMeta.textContent = "No generated query is available to copy.";
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(queryText);
  } else {
    const originalReadOnly = els.queryEditor.hasAttribute("readonly");
    els.queryEditor.removeAttribute("readonly");
    els.queryEditor.focus();
    els.queryEditor.select();
    document.execCommand("copy");
    if (originalReadOnly) {
      els.queryEditor.setAttribute("readonly", "readonly");
    }
  }

  els.resultsMeta.textContent = "Generated query copied to clipboard.";
}

async function handleCopyGeneratedQuery() {
  try {
    await copyGeneratedQuery();
  } catch (error) {
    els.resultsMeta.textContent = `Unable to copy generated query: ${error.message}`;
  }
}

function fetchSavedQueries() {
  try {
    return JSON.parse(localStorage.getItem(QUERY_HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function persistSavedQueries() {
  localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(state.savedQueries));
}

function buildSavedQueryRecord() {
  const template = currentTemplate();
  const visualization = currentVisualization();
  const queryText = applyVisualizationDirective(els.queryEditor.value, visualization);
  const title = `${template?.label || "Custom Query"} - ${els.logSetInput.value.trim() || "No Pod"}`;

  return {
    id: crypto.randomUUID(),
    title,
    templateId: els.templateSelect.value,
    logSet: els.logSetInput.value.trim(),
    field: els.fieldSelect.value,
    fieldValue: els.fieldValueInput.value,
    timeSpan: els.timeSpanSelect.value,
    filterText: els.filterTextInput.value,
    visualization,
    queryText,
    selectedFields: [...state.selectedFields],
    timeStart: els.timeStartInput.value,
    timeEnd: els.timeEndInput.value,
    savedAt: new Date().toISOString()
  };
}

function renderHistory() {
  if (!state.savedQueries.length) {
    els.historyList.className = "history-list empty";
    els.historyList.textContent = "Saved queries will appear here.";
    return;
  }

  els.historyList.className = "history-list";
  els.historyList.innerHTML = "";

  for (const item of state.savedQueries) {
    const row = document.createElement("div");
    row.className = "history-item";

    const title = document.createElement("div");
    title.className = "history-title";
    title.textContent = item.title;

    const meta = document.createElement("div");
    meta.className = "helper-copy";
    meta.textContent = `${item.visualization} view, saved ${formatSavedAt(item.savedAt)}`;

    const actions = document.createElement("div");
    actions.className = "history-actions";

    const loadButton = document.createElement("button");
    loadButton.className = "secondary";
    loadButton.type = "button";
    loadButton.textContent = "Load";
    loadButton.addEventListener("click", () => loadSavedQuery(item.id));

    const deleteButton = document.createElement("button");
    deleteButton.className = "secondary";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteSavedQuery(item.id));

    actions.append(loadButton, deleteButton);
    row.append(title, meta, actions);
    els.historyList.append(row);
  }
}

function loadSavedQuery(id) {
  const item = state.savedQueries.find((entry) => entry.id === id);
  if (!item) {
    return;
  }

  els.templateSelect.value = item.templateId || els.templateSelect.value;
  els.logSetInput.value = item.logSet || "";
  els.fieldSelect.value = item.field || els.fieldSelect.value;
  els.fieldValueInput.value = item.fieldValue || "";
  els.timeSpanSelect.value = item.timeSpan || els.timeSpanSelect.value;
  els.filterTextInput.value = item.filterText || "";
  els.visualizationSelect.value = item.visualization || "table";
  els.timeStartInput.value = item.timeStart || els.timeStartInput.value;
  els.timeEndInput.value = item.timeEnd || els.timeEndInput.value;
  state.selectedFields = [...(item.selectedFields || [])];
  els.queryEditor.value = item.queryText || "";

  renderSuggestedFields(currentTemplate());
  renderSelectedFields();
  renderFieldCatalog();
  syncVisualizationSelectionFromEditor();
  renderTrainingGuide();
  renderQueryAnalysis();
  refreshAutomationPanel({ silent: true });
  els.resultsMeta.textContent = `Loaded saved query from ${formatSavedAt(item.savedAt)}.`;
}

function deleteSavedQuery(id) {
  state.savedQueries = state.savedQueries.filter((item) => item.id !== id);
  persistSavedQueries();
  renderHistory();
}

function saveCurrentQuery(options = {}) {
  const { silent = false } = options;
  const cleanQuery = stripVisualizationDirective(els.queryEditor.value).trim();
  if (!cleanQuery) {
    if (!silent) {
      els.resultsMeta.textContent = "Build or type a query before saving it.";
    }
    return;
  }

  const record = buildSavedQueryRecord();
  const duplicateIndex = state.savedQueries.findIndex((item) => item.queryText === record.queryText);

  if (duplicateIndex >= 0) {
    state.savedQueries.splice(duplicateIndex, 1);
  }

  state.savedQueries.unshift(record);
  state.savedQueries = state.savedQueries.slice(0, HISTORY_LIMIT);
  persistSavedQueries();
  renderHistory();
  if (!silent) {
    els.resultsMeta.textContent = `Saved query "${record.title}".`;
  }
}

function clearSavedQueries() {
  state.savedQueries = [];
  persistSavedQueries();
  renderHistory();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

async function loadHelpContent() {
  try {
    const [templateGuides, glossaryEntries] = await Promise.all([
      fetchJson("/help/template-guides.json"),
      fetchJson("/help/query-glossary.json")
    ]);
    state.templateGuides = templateGuides;
    state.glossaryEntries = glossaryEntries;
  } catch {
    state.templateGuides = [];
    state.glossaryEntries = [];
  }

  renderTrainingGuide();
}

function scheduleHelpContentLoad() {
  const callback = () => {
    loadHelpContent();
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(callback, { timeout: 1500 });
    return;
  }

  window.setTimeout(callback, 0);
}

async function bootstrap() {
  setStatus("Loading metadata", "Connecting to backend");

  const data = await fetchJson("/api/bootstrap");
  state.logSets = data.logSets;
  state.fields = data.fields;
  state.fieldCatalogIndex = buildFieldSearchIndex(state.fields);
  state.fieldSummary = data.fieldSummary;
  state.templates = data.templates;
  state.mockMode = data.mockMode;

  populateLogSetOptions(state.logSets);
  if (!els.logSetInput.value && state.logSets[0]) {
    els.logSetInput.value = state.logSets[0].displayName || state.logSets[0].name;
  }
  populateSelect(els.templateSelect, state.templates, (item) => ({
    value: item.id,
    label: `${item.category} - ${item.label}`
  }));
  populateSelect(els.fieldSelect, state.fields, (item) => ({
    value: displayFieldName(item),
    label: displayFieldName(item)
  }));

  renderSuggestedFields(currentTemplate());
  renderFieldSummary();
  renderSelectedFields();
  renderFieldCatalog();
  renderHistory();
  renderTrainingGuide();
  renderQueryAnalysis();
  renderSensitiveDataNote();
  renderAutomationPanel();
  setStatus(state.mockMode ? "Mock Mode" : "OCI Mode", "Metadata ready");
}

async function buildTemplateQuery() {
  const data = await fetchJson("/api/template-query", {
    method: "POST",
    body: JSON.stringify({
      templateId: els.templateSelect.value,
      logSet: els.logSetInput.value.trim(),
      field: els.fieldSelect.value,
      value: els.fieldValueInput.value,
      timeSpan: els.timeSpanSelect.value,
      filterText: els.filterTextInput.value
    })
  });

  const selectedFieldsClause = state.selectedFields.length
    ? ` | fields ${state.selectedFields.map(formatFieldReference).join(", ")}`
    : "";
  els.queryEditor.value = applyVisualizationDirective(
    `${data.query}${selectedFieldsClause}`,
    els.visualizationSelect.value
  );
  renderTrainingGuide();
  refreshAutomationPanel({ silent: true });
  els.resultsMeta.textContent = currentTemplate()?.description || "";
}

async function runCurrentQuery() {
  els.runButton.disabled = true;
  els.resultsMeta.textContent = "Running query...";

  try {
    const queryText = stripVisualizationDirective(els.queryEditor.value).trim();
    const data = await fetchJson("/api/query", {
      method: "POST",
      body: JSON.stringify({
        queryText,
        timeStart: new Date(els.timeStartInput.value).toISOString(),
        timeEnd: new Date(els.timeEndInput.value).toISOString()
      })
    });

    renderVisualization(data.columns || [], data.rows || []);
    renderTable(data.columns || [], data.rows || []);
    els.resultsMeta.textContent =
      `${(data.rows || []).length} row(s) returned. Visualization: ${currentVisualization()}.`;
    saveCurrentQuery({ silent: true });
  } catch (error) {
    els.resultsMeta.textContent = error.message;
    renderChartMessage("Run a query to render a visualization.");
    renderTable([], []);
  } finally {
    els.runButton.disabled = false;
  }
}

async function suggestForEditor() {
  const editor = els.queryEditor;
  const data = await fetchJson("/api/suggest", {
    method: "POST",
    body: JSON.stringify({
      input: stripVisualizationDirective(editor.value),
      caretPosition: editor.selectionStart
    })
  });

  renderSuggestions(data.suggestions || []);
}

function applySelectedFields() {
  const queryBody = stripVisualizationDirective(els.queryEditor.value);
  const clause = state.selectedFields.length
    ? ` | fields ${state.selectedFields.map(formatFieldReference).join(", ")}`
    : "";
  const stripped = queryBody.replace(/\s+\|\s+fields\s+[^|]+$/i, "");
  els.queryEditor.value = applyVisualizationDirective(
    `${stripped}${clause}`.trim(),
    els.visualizationSelect.value
  );
  renderTrainingGuide();
  refreshAutomationPanel({ silent: true });
}

function loadSavedQueries() {
  state.savedQueries = fetchSavedQueries();
  renderHistory();
}

els.refreshButton.addEventListener("click", async () => {
  try {
    await bootstrap();
  } catch (error) {
    setStatus("Error", error.message);
  }
});

els.templateSelect.addEventListener("change", () => {
  renderSuggestedFields(currentTemplate());
  renderTrainingGuide();
});

document.querySelectorAll(".help-button").forEach((button) => {
  button.addEventListener("click", () => {
    openHelpDialog(button.dataset.helpKey);
  });
});

els.closeHelpDialogButton.addEventListener("click", () => {
  els.helpDialog.close();
});

els.visualizationSelect.addEventListener("change", () => {
  els.queryEditor.value = applyVisualizationDirective(els.queryEditor.value, els.visualizationSelect.value);
  renderTrainingGuide();
  refreshAutomationPanel({ silent: true });
});

const debouncedRenderTrainingGuide = debounce(renderTrainingGuide, TRAINING_GUIDE_DEBOUNCE_MS);
const debouncedRenderFieldCatalog = debounce(renderFieldCatalog, FIELD_CATALOG_DEBOUNCE_MS);

els.queryEditor.addEventListener("input", () => {
  syncVisualizationSelectionFromEditor();
  debouncedRenderTrainingGuide();
});
els.fieldSearchInput.addEventListener("input", debouncedRenderFieldCatalog);
els.fieldOptionFilter.addEventListener("change", renderFieldCatalog);

els.buildButton.addEventListener("click", async () => {
  try {
    await buildTemplateQuery();
  } catch (error) {
    els.resultsMeta.textContent = error.message;
  }
});

els.runButton.addEventListener("click", runCurrentQuery);
els.saveQueryButton.addEventListener("click", saveCurrentQuery);
els.clearHistoryButton.addEventListener("click", clearSavedQueries);
els.applyFieldsButton.addEventListener("click", applySelectedFields);
els.analyzeQueryButton.addEventListener("click", renderQueryAnalysis);
els.copyQueryButton.addEventListener("click", handleCopyGeneratedQuery);
els.refreshAutomationButton.addEventListener("click", async () => {
  await refreshAutomationPanel();
});
els.copyApiPayloadButton.addEventListener("click", async () => {
  await copyOutputValue(els.apiPayloadOutput, "API payload");
});
els.copyCliCommandButton.addEventListener("click", async () => {
  await copyOutputValue(els.cliCommandOutput, "OCI CLI command");
});
els.suggestButton.addEventListener("click", async () => {
  try {
    await suggestForEditor();
  } catch (error) {
    renderSuggestions([]);
    els.resultsMeta.textContent = error.message;
  }
});

formatNowRange();
loadSavedQueries();
scheduleHelpContentLoad();

bootstrap()
  .then(buildTemplateQuery)
  .then(() => refreshAutomationPanel({ silent: true }))
  .catch((error) => {
    setStatus("Error", error.message);
  });
