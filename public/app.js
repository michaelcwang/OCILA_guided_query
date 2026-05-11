const state = {
  logSets: [],
  fields: [],
  templates: [],
  fieldSummary: null,
  mockMode: true,
  selectedFields: []
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
  buildButton: document.querySelector("#buildButton"),
  runButton: document.querySelector("#runButton"),
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

function currentTemplate() {
  return state.templates.find((item) => item.id === els.templateSelect.value);
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
  els.queryEditor.value = `${data.query}${selectedFieldsClause}`;
  els.resultsMeta.textContent = currentTemplate()?.description || "";
}

async function runCurrentQuery() {
  els.runButton.disabled = true;
  els.resultsMeta.textContent = "Running query...";

  try {
    const data = await fetchJson("/api/query", {
      method: "POST",
      body: JSON.stringify({
        queryText: els.queryEditor.value,
        timeStart: new Date(els.timeStartInput.value).toISOString(),
        timeEnd: new Date(els.timeEndInput.value).toISOString()
      })
    });

    renderTable(data.columns || [], data.rows || []);
    els.resultsMeta.textContent = `${(data.rows || []).length} row(s) returned.`;
  } catch (error) {
    els.resultsMeta.textContent = error.message;
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
      input: editor.value,
      caretPosition: editor.selectionStart
    })
  });

  renderSuggestions(data.suggestions || []);
}

function applySelectedFields() {
  const editor = els.queryEditor;
  const clause = state.selectedFields.length
    ? ` | fields ${state.selectedFields.join(", ")}`
    : "";
  const stripped = editor.value.replace(/\s+\|\s+fields\s+[^|]+$/i, "");
  editor.value = `${stripped}${clause}`;
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

bootstrap()
  .then(buildTemplateQuery)
  .catch((error) => {
    setStatus("Error", error.message);
  });
