function escapeQueryValue(value) {
  return value.replaceAll("'", "\\'");
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
    queryBuilder: ({ logSet, filterText = "" }) => {
      const logSetClause = buildLogSetClause(logSet);
      const suffix = filterText ? ` and ${filterText}` : "";
      return `${logSetClause} and ('Log Source' = saas.fa_appslogger or 'Log Source' = saas.fa_wls_wsasync or 'Log Source' = saas.fa_wls_access)${suffix} | link span = 1minute Time | addfields [ 'Log Source' = saas.fa_appslogger and 'processing order' | stats count(ECID) as 'Orders Submitted' ], [ 'Log Source' = saas.fa_wls_access and URI like '/fscmRestApi/resources/11.13.18.05/salesOrdersForOrderHub/DSP:%' | stats count as 'DSP operations on orders' ], [ 'Log Source' = saas.fa_wls_access and URI like '/fscmrestapi/applcoreapi/search/v1/fa-fscm-item-version/_search%' | stats count as 'Search API calls' ], [ 'Log Source' = saas.fa_wls_wsasync and '/fscmService/OrchInfraUtilService?wslazyloading][OperationName:' and 'processed' | stats count as 'Orchestration steps processed' ], [ 'Log Source' = saas.fa_wls_wsasync and '/fscmService/OrchInfraUtilService?wslazyloading][OperationName:' | stats avg(ProcessingDuration) as 'Orchestration processing time (ms)' ], [ 'Log Source' = saas.fa_wls_access and URI like '/fscmRestApi/resources/11.13.18.05/salesOrdersForOrderHub%' | stats avg(Duration) as 'Orders API response time (seconds)' ], [ 'Log Source' = saas.fa_wls_access and URI like '/fscmRestApi/resources/11.13.18.05/salesOrdersForOrderHub%' and Duration > 300 | stats count as 'Orders API timeouts' ], [ 'Log Source' = saas.fa_wls_access and URI like '/fscmrestapi/applcoreapi/search/v1/fa-fscm-item-version/_search%' | stats avg(Duration) as 'Search API performance' ]`;
    }
  },
  {
    id: "fusion-order-throughput",
    label: "Fusion Order Throughput",
    category: "Fusion",
    description: "Measure order processing throughput from order submit through orchestration and search calls.",
    requiredFields: ["Log Set"],
    suggestedFields: ["Log Source", "URI", "Status", "Method", "ECID"],
    queryBuilder: ({ logSet, filterText = "" }) => {
      const logSetClause = buildLogSetClause(logSet);
      const suffix = filterText ? ` and ${filterText}` : "";
      return `${logSetClause} and ('Log Source' = saas.fa_appslogger or 'Log Source' = saas.fa_wls_wsasync or 'Log Source' = saas.fa_wls_access)${suffix} | link span = 1minute Time | addfields [ 'Log Source' = saas.fa_wls_access and URI = '/fscmRestApi/resources/11.13.18.05/salesOrdersForOrderHub' and Status = '201' and Method = POST | stats count(ECID) as 'Orders Submitted' ], [ 'Log Source' = saas.fa_wls_access and URI like '/fscmRestApi/resources/11.13.18.05/salesOrdersForOrderHub/DSP:%' | stats count as 'DSP operations on orders' ], [ 'Log Source' = saas.fa_wls_access and URI like '/fscmrestapi/applcoreapi/search/v1/fa-fscm-item-version/_search%' | stats count as 'Search API calls' ], [ 'Log Source' = saas.fa_wls_wsasync and '/fscmService/OrchInfraUtilService?wslazyloading][OperationName:' and 'processed' | stats count as 'Orchestration steps processed' ], [ 'Log Source' = saas.fa_wls_wsasync and '/fscmService/OrchInfraUtilService?wslazyloading][OperationName:' | stats avg(ProcessingDuration) as 'Orchestration processing time (ms)' ], [ 'Log Source' = saas.fa_wls_access and URI like '/fscmRestApi/resources/11.13.18.05/salesOrdersForOrderHub%' | stats avg(Duration) as 'Orders API response time (seconds)' ], [ 'Log Source' = saas.fa_wls_access and URI like '/fscmRestApi/resources/11.13.18.05/salesOrdersForOrderHub%' and Duration > 300 | stats count as 'Orders API timeouts' ], [ 'Log Source' = saas.fa_wls_access and URI like '/fscmrestapi/applcoreapi/search/v1/fa-fscm-item-version/_search%' | stats avg(Duration) as 'Search API performance' ]`;
    }
  },
  {
    id: "slow-db-queries",
    label: "Slow Running DB Queries",
    category: "Database",
    description: "Find statements or executions with the highest average and max runtime.",
    requiredFields: ["Log Set"],
    suggestedFields: ["DBName", "DBSystemId", "SQL_ID", "Elapsed Time", "DatabaseId"],
    queryBuilder: ({ logSet, timeSpan = "5minute", filterText = "" }) => {
      const logSetClause = buildLogSetClause(logSet);
      const suffix = filterText ? ` and ${filterText}` : "";
      return `${logSetClause}${suffix} | link span = ${timeSpan} Time | stats avg('Elapsed Time') as 'Avg Elapsed', max('Elapsed Time') as 'Max Elapsed', count as 'Executions' by SQL_ID, DBName | sort by 'Avg Elapsed' desc | head 20`;
    }
  },
  {
    id: "db-connections",
    label: "Database Connections",
    category: "Database",
    description: "Track how many sessions or connections are active over time.",
    requiredFields: ["Log Set"],
    suggestedFields: ["DBName", "DBUser", "ClientHost", "ServiceName"],
    queryBuilder: ({ logSet, timeSpan = "1minute", filterText = "" }) => {
      const logSetClause = buildLogSetClause(logSet);
      const suffix = filterText ? ` and ${filterText}` : "";
      return `${logSetClause}${suffix} | link span = ${timeSpan} Time | stats count_distinct(SessionId) as 'Active Sessions' by Time`;
    }
  },
  {
    id: "app-uptime",
    label: "Application Uptime",
    category: "Application",
    description: "Estimate uptime from heartbeat or health-check style logs.",
    requiredFields: ["Log Set"],
    suggestedFields: ["Host", "ApplicationName", "Status", "Severity"],
    queryBuilder: ({ logSet, timeSpan = "5minute", filterText = "" }) => {
      const logSetClause = buildLogSetClause(logSet);
      const suffix = filterText ? ` and ${filterText}` : "";
      return `${logSetClause}${suffix} | link span = ${timeSpan} Time | addfields [ Status = 'UP' or Message like '%healthy%' | stats count as 'Healthy Signals' ], [ Status = 'DOWN' or Message like '%unhealthy%' | stats count as 'Unhealthy Signals' ]`;
    }
  },
  {
    id: "blocking-sessions",
    label: "Blocking Sessions",
    category: "Database",
    description: "Identify blockers and the sessions they are impacting.",
    requiredFields: ["Log Set"],
    suggestedFields: ["BlockingSession", "SessionId", "DBUser", "WaitClass", "EventName"],
    queryBuilder: ({ logSet, filterText = "" }) => {
      const logSetClause = buildLogSetClause(logSet);
      const suffix = filterText ? ` and ${filterText}` : "";
      return `${logSetClause} and BlockingSession is not null${suffix} | stats count as 'Blocked Sessions', values(SessionId) as 'Victims' by BlockingSession, DBUser, EventName | sort by 'Blocked Sessions' desc`;
    }
  },
  {
    id: "database-id-lookup",
    label: "Database ID Lookup",
    category: "Database",
    description: "Search for a known database or system ID and return matching events.",
    requiredFields: ["Log Set", "DatabaseId"],
    suggestedFields: ["DatabaseId", "DBSystemId", "DBName", "Host"],
    queryBuilder: ({ logSet, field = "DatabaseId", value = "", filterText = "" }) => {
      const logSetClause = buildLogSetClause(logSet);
      const escapedValue = escapeQueryValue(value);
      const suffix = filterText ? ` and ${filterText}` : "";
      return `${logSetClause} and ${field} = '${escapedValue}'${suffix} | fields Time, ${field}, DBName, Host, Message | sort by Time desc | head 100`;
    }
  },
  {
    id: "api-endpoint-correlation",
    label: "API Endpoint Correlation",
    category: "Application",
    description: "Show endpoint volume by source system, method, or caller.",
    requiredFields: ["Log Set", "URI"],
    suggestedFields: ["URI", "Method", "Status", "ClientIP", "Source", "ECID"],
    queryBuilder: ({ logSet, value = "", filterText = "" }) => {
      const logSetClause = buildLogSetClause(logSet);
      const escapedValue = escapeQueryValue(value);
      const suffix = filterText ? ` and ${filterText}` : "";
      return `${logSetClause} and URI like '${escapedValue}'${suffix} | stats count as 'Calls', count_distinct(ECID) as 'Correlated Requests', avg(Duration) as 'Avg Duration' by Source, ClientIP, Method, Status | sort by 'Calls' desc`;
    }
  }
];

export function getTemplateById(templateId) {
  return queryTemplates.find((template) => template.id === templateId) || null;
}
