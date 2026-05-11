const QUERY_HISTORY_KEY = "ocila-guided-query-history-v1";
const HISTORY_LIMIT = 25;
const VISUALIZATION_RE = /^\s*--\s*@visualization:\s*(table|line|bar|metric)\s*\r?\n?/i;

const state = {
  logSets: [],
  fields: [],
  templates: [],
  fieldSummary: null,
  mockMode: true,
  selectedFields: [],
  savedQueries: []
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
  queryEditor: document.querySelector("#queryEditor"),
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
  const filtered = state.fields.filter((field) => {
    const haystack = [
      field.displayName,
      field.name,
      field.description,
      field.dataType,
      ...fieldTags(field)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(searchTerm) && fieldMatchesOption(field, option);
  });

  if (!filtered.length) {
    els.fieldCatalog.innerHTML = `<div class="helper-copy">No fields match the current filter.</div>`;
    return;
  }

  els.fieldCatalog.innerHTML = "";

  for (const field of filtered) {
    const row = document.createElement("label");
    row.className = "field-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selectedFields.includes(displayFieldName(field));
    checkbox.addEventListener("change", () => {
      toggleSelectedField(displayFieldName(field), checkbox.checked);
    });

    const content = document.createElement("div");
    const title = document.createElement("div");
    title.className = "field-name";
    title.textContent = displayFieldName(field);

    const description = document.createElement("div");
    description.className = "helper-copy";
    description.textContent = field.description || field.name || "";

    content.append(title, description);

    const meta = document.createElement("div");
    meta.className = "field-meta";

    for (const tagText of fieldTags(field)) {
      const tag = document.createElement("span");
      tag.className = "field-tag";
      tag.textContent = tagText;
      meta.append(tag);
    }

    row.append(checkbox, content, meta);
    els.fieldCatalog.append(row);
  }
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
  renderFieldCatalog();
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

  for (const column of columns) {
    const th = document.createElement("th");
    th.textContent = column;
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

async function bootstrap() {
  setStatus("Loading metadata", "Connecting to backend");

  const data = await fetchJson("/api/bootstrap");
  state.logSets = data.logSets;
  state.fields = data.fields;
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
    ? ` | fields ${state.selectedFields.join(", ")}`
    : "";
  els.queryEditor.value = applyVisualizationDirective(
    `${data.query}${selectedFieldsClause}`,
    els.visualizationSelect.value
  );
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
    ? ` | fields ${state.selectedFields.join(", ")}`
    : "";
  const stripped = queryBody.replace(/\s+\|\s+fields\s+[^|]+$/i, "");
  els.queryEditor.value = applyVisualizationDirective(
    `${stripped}${clause}`.trim(),
    els.visualizationSelect.value
  );
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
});

els.visualizationSelect.addEventListener("change", () => {
  els.queryEditor.value = applyVisualizationDirective(els.queryEditor.value, els.visualizationSelect.value);
});

els.queryEditor.addEventListener("input", syncVisualizationSelectionFromEditor);
els.fieldSearchInput.addEventListener("input", renderFieldCatalog);
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

bootstrap()
  .then(buildTemplateQuery)
  .catch((error) => {
    setStatus("Error", error.message);
  });
