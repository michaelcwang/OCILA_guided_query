function escapeQueryValue(value) {
  return value.replaceAll("'", "\\'");
}

function normalizeFieldToken(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll(/['"`]/g, "")
    .replaceAll(/[^a-z0-9]/g, "");
}

function formatFieldReference(fieldName) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(fieldName)
    ? fieldName
    : `'${escapeQueryValue(fieldName)}'`;
}

function resolveFieldName(availableFields, candidates, options = {}) {
  const { required = false, label = "field" } = options;
  const fields = Array.isArray(availableFields) ? availableFields : [];

  if (!fields.length) {
    if (required) {
      throw new Error(`Unable to resolve ${label} because no field metadata is available.`);
    }
    return null;
  }

  const lookup = new Map();
  for (const field of fields) {
    if (typeof options.filter === "function" && !options.filter(field)) {
      continue;
    }
    const names = [field?.displayName, field?.name].filter(Boolean);
    for (const name of names) {
      const token = normalizeFieldToken(name);
      if (!lookup.has(token)) {
        lookup.set(token, name);
      }
    }
  }

  for (const candidate of candidates) {
    const match = lookup.get(normalizeFieldToken(candidate));
    if (match) {
      return match;
    }
  }

  if (required) {
    throw new Error(`Unable to resolve ${label} from the available OCILA fields.`);
  }

  return null;
}

function isStatsByCandidate(field) {
  return Boolean(field?.isFacetEligible || field?.isSummarizable);
}

function isNumericAggregateCandidate(field) {
  const dataType = String(field?.dataType || "").toUpperCase();
  return Boolean(field?.isMetricValueEligible || field?.isSummarizable || dataType === "NUMBER");
}

function isLikelyBlockingField(fieldName) {
  const normalized = normalizeFieldToken(fieldName);
  return normalized.includes("block") || normalized.includes("blocking");
}

function isLikelyDatabaseLookupField(fieldName) {
  const normalized = normalizeFieldToken(fieldName);
  return normalized.includes("database") || normalized.includes("db");
}

function buildStatsClause(statExpressions, groupFields = []) {
  const statsBody = statExpressions.filter(Boolean).join(", ");
  const byClause = groupFields.length ? ` by ${groupFields.join(", ")}` : "";
  return `stats ${statsBody}${byClause}`;
}

function buildFieldsClause(fieldNames) {
  const seen = new Set();
  const fields = [];

  for (const fieldName of fieldNames) {
    if (!fieldName) {
      continue;
    }

    const token = normalizeFieldToken(fieldName);
    if (seen.has(token)) {
      continue;
    }

    seen.add(token);
    fields.push(formatFieldReference(fieldName));
  }

  return fields.join(", ");
}

function buildLogSetClause(logSetInput) {
  const logSets = String(logSetInput || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!logSets.length) {
    return "";
  }

  if (logSets.length === 1) {
    return `'Log Set' = '${escapeQueryValue(logSets[0])}'`;
  }

  return `(${logSets.map((logSet) => `'Log Set' = '${escapeQueryValue(logSet)}'`).join(" or ")})`;
}

export const queryTemplates = [
  {
    id: "fusion-order-validation",
    label: "Fusion Order Validation",
    category: "Fusion",
    description: "Validate order count and end-to-end timing across appslogger, wsasync, and access logs.",
    requiredFields: ["Log Set"],
    suggestedFields: ["Log Source", "URI", "ECID", "Duration", "ProcessingDuration"],
    queryBuilder: ({ logSet, filterText = "", availableFields = [] }) => {
      const logSetClause = buildLogSetClause(logSet);
      const suffix = filterText ? ` and ${filterText}` : "";
      const logSourceField = resolveFieldName(availableFields, ["Log Source"], {
        required: true,
        label: "log source field"
      });
      const uriField = resolveFieldName(availableFields, ["URI", "Url", "Request URI"], {
        required: true,
        label: "URI field"
      });
      const ecidField = resolveFieldName(availableFields, ["ECID"], {
        required: true,
        label: "ECID field"
      });
      const processingDurationField = resolveFieldName(
        availableFields,
        ["ProcessingDuration", "Processing Duration"],
        {
          required: true,
          label: "processing duration field"
        }
      );
      const durationField = resolveFieldName(availableFields, ["Duration"], {
        required: true,
        label: "duration field"
      });
      const logSourceRef = formatFieldReference(logSourceField);
      const uriRef = formatFieldReference(uriField);
      const ecidRef = formatFieldReference(ecidField);
      const processingDurationRef = formatFieldReference(processingDurationField);
      const durationRef = formatFieldReference(durationField);

      return `${logSetClause} and (${logSourceRef} = saas.fa_appslogger or ${logSourceRef} = saas.fa_wls_wsasync or ${logSourceRef} = saas.fa_wls_access)${suffix} | link span = 1minute Time | addfields [ ${logSourceRef} = saas.fa_appslogger and 'processing order' | stats count(${ecidRef}) as 'Orders Submitted' ], [ ${logSourceRef} = saas.fa_wls_access and ${uriRef} like '/fscmRestApi/resources/11.13.18.05/salesOrdersForOrderHub/DSP:%' | stats count as 'DSP operations on orders' ], [ ${logSourceRef} = saas.fa_wls_access and ${uriRef} like '/fscmrestapi/applcoreapi/search/v1/fa-fscm-item-version/_search%' | stats count as 'Search API calls' ], [ ${logSourceRef} = saas.fa_wls_wsasync and '/fscmService/OrchInfraUtilService?wslazyloading][OperationName:' and 'processed' | stats count as 'Orchestration steps processed' ], [ ${logSourceRef} = saas.fa_wls_wsasync and '/fscmService/OrchInfraUtilService?wslazyloading][OperationName:' | stats avg(${processingDurationRef}) as 'Orchestration processing time (ms)' ], [ ${logSourceRef} = saas.fa_wls_access and ${uriRef} like '/fscmRestApi/resources/11.13.18.05/salesOrdersForOrderHub%' | stats avg(${durationRef}) as 'Orders API response time (seconds)' ], [ ${logSourceRef} = saas.fa_wls_access and ${uriRef} like '/fscmRestApi/resources/11.13.18.05/salesOrdersForOrderHub%' and ${durationRef} > 300 | stats count as 'Orders API timeouts' ], [ ${logSourceRef} = saas.fa_wls_access and ${uriRef} like '/fscmrestapi/applcoreapi/search/v1/fa-fscm-item-version/_search%' | stats avg(${durationRef}) as 'Search API performance' ]`;
    }
  },
  {
    id: "fusion-order-throughput",
    label: "Fusion Order Throughput",
    category: "Fusion",
    description: "Measure order processing throughput from order submit through orchestration and search calls.",
    requiredFields: ["Log Set"],
    suggestedFields: ["Log Source", "URI", "Status", "Method", "ECID"],
    queryBuilder: ({ logSet, filterText = "", availableFields = [] }) => {
      const logSetClause = buildLogSetClause(logSet);
      const suffix = filterText ? ` and ${filterText}` : "";
      const logSourceField = resolveFieldName(availableFields, ["Log Source"], {
        required: true,
        label: "log source field"
      });
      const uriField = resolveFieldName(availableFields, ["URI", "Url", "Request URI"], {
        required: true,
        label: "URI field"
      });
      const statusField = resolveFieldName(availableFields, ["Status", "Status Code"], {
        required: true,
        label: "status field"
      });
      const methodField = resolveFieldName(availableFields, ["Method", "HTTP Method"], {
        required: true,
        label: "method field"
      });
      const ecidField = resolveFieldName(availableFields, ["ECID"], {
        required: true,
        label: "ECID field"
      });
      const processingDurationField = resolveFieldName(
        availableFields,
        ["ProcessingDuration", "Processing Duration"],
        {
          required: true,
          label: "processing duration field"
        }
      );
      const durationField = resolveFieldName(availableFields, ["Duration"], {
        required: true,
        label: "duration field"
      });
      const logSourceRef = formatFieldReference(logSourceField);
      const uriRef = formatFieldReference(uriField);
      const statusRef = formatFieldReference(statusField);
      const methodRef = formatFieldReference(methodField);
      const ecidRef = formatFieldReference(ecidField);
      const processingDurationRef = formatFieldReference(processingDurationField);
      const durationRef = formatFieldReference(durationField);

      return `${logSetClause} and (${logSourceRef} = saas.fa_appslogger or ${logSourceRef} = saas.fa_wls_wsasync or ${logSourceRef} = saas.fa_wls_access)${suffix} | link span = 1minute Time | addfields [ ${logSourceRef} = saas.fa_wls_access and ${uriRef} = '/fscmRestApi/resources/11.13.18.05/salesOrdersForOrderHub' and ${statusRef} = '201' and ${methodRef} = 'POST' | stats count(${ecidRef}) as 'Orders Submitted' ], [ ${logSourceRef} = saas.fa_wls_access and ${uriRef} like '/fscmRestApi/resources/11.13.18.05/salesOrdersForOrderHub/DSP:%' | stats count as 'DSP operations on orders' ], [ ${logSourceRef} = saas.fa_wls_access and ${uriRef} like '/fscmrestapi/applcoreapi/search/v1/fa-fscm-item-version/_search%' | stats count as 'Search API calls' ], [ ${logSourceRef} = saas.fa_wls_wsasync and '/fscmService/OrchInfraUtilService?wslazyloading][OperationName:' and 'processed' | stats count as 'Orchestration steps processed' ], [ ${logSourceRef} = saas.fa_wls_wsasync and '/fscmService/OrchInfraUtilService?wslazyloading][OperationName:' | stats avg(${processingDurationRef}) as 'Orchestration processing time (ms)' ], [ ${logSourceRef} = saas.fa_wls_access and ${uriRef} like '/fscmRestApi/resources/11.13.18.05/salesOrdersForOrderHub%' | stats avg(${durationRef}) as 'Orders API response time (seconds)' ], [ ${logSourceRef} = saas.fa_wls_access and ${uriRef} like '/fscmRestApi/resources/11.13.18.05/salesOrdersForOrderHub%' and ${durationRef} > 300 | stats count as 'Orders API timeouts' ], [ ${logSourceRef} = saas.fa_wls_access and ${uriRef} like '/fscmrestapi/applcoreapi/search/v1/fa-fscm-item-version/_search%' | stats avg(${durationRef}) as 'Search API performance' ]`;
    }
  },
  {
    id: "slow-db-queries",
    label: "Slow Running DB Queries",
    category: "Database",
    description: "Find executions with the highest elapsed runtime.",
    requiredFields: ["Log Set"],
    suggestedFields: ["DBName", "DBSystemId", "SQL_ID", "Elapsed Time", "DatabaseId"],
    queryBuilder: ({ logSet, filterText = "", availableFields = [] }) => {
      const logSetClause = buildLogSetClause(logSet);
      const suffix = filterText ? ` and ${filterText}` : "";
      const elapsedField = resolveFieldName(availableFields, ["Elapsed Time", "ElapsedTime"], {
        required: true,
        label: "elapsed time field",
        filter: isNumericAggregateCandidate
      });
      const sqlIdField = resolveFieldName(availableFields, ["SQL_ID", "SQL ID"]);
      const dbNameField = resolveFieldName(availableFields, ["DBName", "DB Name", "Database Name"]);
      const dbSystemIdField = resolveFieldName(availableFields, ["DBSystemId", "DB System ID"]);
      const messageField = resolveFieldName(availableFields, ["Message"]);
      const elapsedRef = formatFieldReference(elapsedField);
      const projection = buildFieldsClause([
        "Time",
        elapsedField,
        sqlIdField,
        dbNameField,
        dbSystemIdField,
        messageField
      ]);
      return `${logSetClause} and ${elapsedRef} is not null${suffix} | fields ${projection} | sort -${elapsedRef} | head limit=20`;
    }
  },
  {
    id: "db-connections",
    label: "Database Connections",
    category: "Database",
    description: "Track how many sessions or connections are active over time.",
    requiredFields: ["Log Set"],
    suggestedFields: ["DBName", "DBUser", "ClientHost", "ServiceName"],
    queryBuilder: ({ logSet, timeSpan = "1minute", filterText = "", availableFields = [] }) => {
      const logSetClause = buildLogSetClause(logSet);
      const suffix = filterText ? ` and ${filterText}` : "";
      const sessionField =
        resolveFieldName(availableFields, ["Session ID", "SessionId"], {
          required: true,
          label: "session identifier field"
        }) || "Session ID";
      return `${logSetClause}${suffix} | link span = ${timeSpan} Time | stats distinctcount(${formatFieldReference(sessionField)}) as ActiveSessions by Time`;
    }
  },
  {
    id: "app-uptime",
    label: "Application Uptime",
    category: "Application",
    description: "Estimate uptime from heartbeat or health-check style logs.",
    requiredFields: ["Log Set"],
    suggestedFields: ["Host", "ApplicationName", "Status", "Severity"],
    queryBuilder: ({ logSet, timeSpan = "5minute", filterText = "", availableFields = [] }) => {
      const logSetClause = buildLogSetClause(logSet);
      const suffix = filterText ? ` and ${filterText}` : "";
      const statusField = resolveFieldName(availableFields, ["Status", "Status Code"], {
        required: true,
        label: "status field"
      });
      const messageField = resolveFieldName(availableFields, ["Message"], {
        required: true,
        label: "message field"
      });
      const statusRef = formatFieldReference(statusField);
      const messageRef = formatFieldReference(messageField);
      return `${logSetClause}${suffix} | link span = ${timeSpan} Time | addfields [ ${statusRef} = 'UP' or ${messageRef} like '%healthy%' | stats count as HealthySignals ], [ ${statusRef} = 'DOWN' or ${messageRef} like '%unhealthy%' | stats count as UnhealthySignals ]`;
    }
  },
  {
    id: "blocking-sessions",
    label: "Blocking Sessions",
    category: "Database",
    description: "Identify blockers and the sessions they are impacting.",
    requiredFields: ["Log Set"],
    suggestedFields: ["BlockingSession", "DBUser", "WaitClass", "EventName"],
    queryBuilder: ({ logSet, field = "", filterText = "", availableFields = [] }) => {
      const logSetClause = buildLogSetClause(logSet);
      const suffix = filterText ? ` and ${filterText}` : "";
      const requestedBlockingField = String(field || "").trim();
      const defaultBlockingCandidates = [
        "BlockingSession",
        "Blocking Session",
        "Blocking Session ID",
        "Blocking Session Id",
        "Blocking SID",
        "Blocking SID Serial",
        "Blocking Serial",
        "Blocker Session"
      ];
      const blockingCandidates = isLikelyBlockingField(requestedBlockingField)
        ? [requestedBlockingField, ...defaultBlockingCandidates]
        : defaultBlockingCandidates;
      const blockingField = resolveFieldName(availableFields, blockingCandidates, {
        required: true,
        label: "blocking session field",
        filter: isStatsByCandidate
      });
      const blockingRef = formatFieldReference(blockingField);

      return `${logSetClause} and ${blockingRef} is not null${suffix} | stats count as BlockedSessions by ${blockingRef} | sort -BlockedSessions`;
    }
  },
  {
    id: "database-id-lookup",
    label: "Database ID Lookup",
    category: "Database",
    description: "Search for a known database or system ID and return matching events.",
    requiredFields: ["Log Set", "DatabaseId"],
    suggestedFields: ["DatabaseId", "DBSystemId", "DBName", "Host"],
    queryBuilder: ({ logSet, field = "DatabaseId", value = "", filterText = "", availableFields = [] }) => {
      const logSetClause = buildLogSetClause(logSet);
      const escapedValue = escapeQueryValue(value);
      const suffix = filterText ? ` and ${filterText}` : "";
      const requestedField = String(field || "").trim();
      const targetCandidates = isLikelyDatabaseLookupField(requestedField)
        ? [requestedField, "DatabaseId", "Database ID", "DBSystemId", "DB System ID", "DBName", "DB Name"]
        : ["DatabaseId", "Database ID", "DBSystemId", "DB System ID", "DBName", "DB Name"];
      const targetField = resolveFieldName(availableFields, targetCandidates, {
        required: true,
        label: "database lookup field"
      });
      const dbNameField = resolveFieldName(availableFields, ["DBName", "DB Name", "Database Name"]);
      const hostField = resolveFieldName(availableFields, ["Host", "Hostname"]);
      const messageField = resolveFieldName(availableFields, ["Message"]);
      const fieldRef = formatFieldReference(targetField);
      const projection = buildFieldsClause(["Time", targetField, dbNameField, hostField, messageField]);
      return `${logSetClause} and ${fieldRef} = '${escapedValue}'${suffix} | fields ${projection} | sort -Time | head limit=100`;
    }
  },
  {
    id: "api-endpoint-correlation",
    label: "API Endpoint Correlation",
    category: "Application",
    description: "Show endpoint volume by source system, method, or caller.",
    requiredFields: ["Log Set", "URI"],
    suggestedFields: ["URI", "Method", "Status", "ClientIP", "Source", "ECID"],
    queryBuilder: ({ logSet, value = "", filterText = "", availableFields = [] }) => {
      const logSetClause = buildLogSetClause(logSet);
      const escapedValue = escapeQueryValue(value);
      const suffix = filterText ? ` and ${filterText}` : "";
      const uriField = resolveFieldName(availableFields, ["URI", "Url", "Request URI"], {
        required: true,
        label: "URI field"
      });
      const ecidField = resolveFieldName(availableFields, ["ECID"]);
      const durationField = resolveFieldName(availableFields, ["Duration"]);
      const sourceField = resolveFieldName(availableFields, ["Source", "Caller Source"], {
        filter: isStatsByCandidate
      });
      const clientIpField = resolveFieldName(availableFields, ["ClientIP", "Client IP", "IP Address"], {
        filter: isStatsByCandidate
      });
      const methodField = resolveFieldName(availableFields, ["Method", "HTTP Method"], {
        filter: isStatsByCandidate
      });
      const statusField = resolveFieldName(availableFields, ["Status", "Status Code"], {
        filter: isStatsByCandidate
      });
      const statsExpressions = [
        "count as Calls",
        ecidField ? `distinctcount(${formatFieldReference(ecidField)}) as CorrelatedRequests` : null,
        durationField ? `avg(${formatFieldReference(durationField)}) as AvgDuration` : null
      ];
      const groupFields = [sourceField, clientIpField, methodField, statusField]
        .filter(Boolean)
        .map((fieldName) => formatFieldReference(fieldName));
      return `${logSetClause} and ${formatFieldReference(uriField)} like '${escapedValue}'${suffix} | ${buildStatsClause(
        statsExpressions,
        groupFields
      )} | sort -Calls`;
    }
  }
];

export function getTemplateById(templateId) {
  return queryTemplates.find((template) => template.id === templateId) || null;
}
