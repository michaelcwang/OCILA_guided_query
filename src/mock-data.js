import { queryTemplates } from "./query-templates.js";

export const mockLogSets = [
  { name: "sample-pod-dev", displayName: "sample-pod-dev" },
  { name: "sample-pod-prod", displayName: "sample-pod-prod" },
  { name: "sample-db-observability", displayName: "sample-db-observability" }
];

export const mockFields = [
  {
    name: "Log Set",
    displayName: "Log Set",
    dataType: "STRING",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isSystem: true,
    isPrimary: true
  },
  {
    name: "Log Source",
    displayName: "Log Source",
    dataType: "STRING",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isSystem: true,
    isPrimary: true
  },
  {
    name: "URI",
    displayName: "URI",
    dataType: "STRING",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isMetricKeyEligible: true,
    isSystem: true
  },
  {
    name: "Method",
    displayName: "Method",
    dataType: "STRING",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isSystem: true
  },
  {
    name: "Status",
    displayName: "Status",
    dataType: "STRING",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isSystem: true
  },
  {
    name: "Duration",
    displayName: "Duration",
    dataType: "NUMBER",
    isFacetEligible: true,
    rangeFacetEligible: 1,
    isTableEligible: true,
    isSummarizable: true,
    isMetricValueEligible: true,
    isSystem: true
  },
  {
    name: "ECID",
    displayName: "ECID",
    dataType: "STRING",
    isFacetEligible: true,
    isHighCardinality: true,
    isTableEligible: true,
    isSystem: true
  },
  {
    name: "Source",
    displayName: "Source",
    dataType: "STRING",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isSystem: false
  },
  {
    name: "ClientIP",
    displayName: "ClientIP",
    dataType: "STRING",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isSystem: false
  },
  {
    name: "DatabaseId",
    displayName: "DatabaseId",
    dataType: "STRING",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isSystem: false
  },
  {
    name: "DBSystemId",
    displayName: "DBSystemId",
    dataType: "STRING",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isSystem: false
  },
  {
    name: "DBName",
    displayName: "DBName",
    dataType: "STRING",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isSystem: false
  },
  {
    name: "SQL_ID",
    displayName: "SQL_ID",
    dataType: "STRING",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isSystem: false
  },
  {
    name: "Elapsed Time",
    displayName: "Elapsed Time",
    dataType: "NUMBER",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isMetricValueEligible: true,
    isSystem: false
  },
  {
    name: "DBUser",
    displayName: "DBUser",
    dataType: "STRING",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isSystem: false
  },
  {
    name: "Session ID",
    displayName: "Session ID",
    dataType: "STRING",
    isFacetEligible: true,
    isHighCardinality: true,
    isTableEligible: true,
    isSystem: false
  },
  {
    name: "ClientHost",
    displayName: "ClientHost",
    dataType: "STRING",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isSystem: false
  },
  {
    name: "ServiceName",
    displayName: "ServiceName",
    dataType: "STRING",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isSystem: false
  },
  {
    name: "BlockingSession",
    displayName: "BlockingSession",
    dataType: "STRING",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isSystem: false
  },
  {
    name: "ProcessingDuration",
    displayName: "ProcessingDuration",
    dataType: "NUMBER",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isMetricValueEligible: true,
    isSystem: false
  },
  {
    name: "EventName",
    displayName: "EventName",
    dataType: "STRING",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isSystem: false
  },
  {
    name: "Host",
    displayName: "Host",
    dataType: "STRING",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isSystem: true
  },
  {
    name: "ApplicationName",
    displayName: "ApplicationName",
    dataType: "STRING",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isSystem: false
  },
  {
    name: "Severity",
    displayName: "Severity",
    dataType: "STRING",
    isFacetEligible: true,
    isTableEligible: true,
    isSummarizable: true,
    isSystem: true,
    isPrimary: true
  },
  {
    name: "Message",
    displayName: "Message",
    dataType: "STRING",
    isFacetEligible: false,
    isLargeData: true,
    isTableEligible: true,
    isSystem: true
  }
];

export const mockFieldValues = {
  "Log Source": ["saas.fa_appslogger", "saas.fa_wls_wsasync", "saas.fa_wls_access"],
  Method: ["GET", "POST", "PUT"],
  Status: ["200", "201", "500"],
  DBName: ["FUSIONDB1", "ORDERHUBDB", "FINDB"],
  Source: ["OIC", "ERPUI", "BATCH", "INTEGRATION_CLOUD"]
};

export const mockFieldSummary = {
  oobCount: mockFields.filter((field) => field.isSystem).length,
  nonOobCount: mockFields.filter((field) => !field.isSystem).length,
  usageDetails: [
    { name: "STRING", count: mockFields.filter((field) => field.dataType === "STRING").length },
    { name: "NUMBER", count: mockFields.filter((field) => field.dataType === "NUMBER").length }
  ]
};

export function buildMockResults(queryText) {
  const normalized = queryText.toLowerCase();

  if (normalized.includes("blockingsession")) {
    return {
      columns: ["BlockingSession", "DBUser", "EventName", "BlockedSessions"],
      rows: [
        ["8342", "ORDER_APP", "enq: TX - row lock contention", 7],
        ["9144", "FIN_USER", "buffer busy waits", 3]
      ]
    };
  }

  if (normalized.includes("uri like")) {
    return {
      columns: ["Source", "ClientIP", "Method", "Status", "Calls", "CorrelatedRequests", "AvgDuration"],
      rows: [
        ["OIC", "10.1.4.12", "POST", "201", 132, 118, 1.84],
        ["ERPUI", "10.1.8.45", "GET", "200", 88, 80, 0.42],
        ["BATCH", "10.1.12.9", "POST", "500", 6, 6, 6.91]
      ]
    };
  }

  if (normalized.includes("session id")) {
    return {
      columns: ["Time", "ActiveSessions"],
      rows: [
        ["2026-05-11T10:00:00Z", 42],
        ["2026-05-11T10:01:00Z", 47],
        ["2026-05-11T10:02:00Z", 45]
      ]
    };
  }

  if (normalized.includes("elapsed time")) {
    return {
      columns: ["Time", "Elapsed Time", "SQL_ID", "DBName", "DBSystemId", "Message"],
      rows: [
        ["2026-05-11T10:02:14Z", 40192, "4w9s8bpq1m3x7", "ORDERHUBDB", "dbsystem-orderhub", "High elapsed SQL execution"],
        ["2026-05-11T10:01:44Z", 22014, "8v2f1hpq6b9k2", "FUSIONDB1", "dbsystem-fusion", "Slow query execution"],
        ["2026-05-11T10:00:31Z", 14002, "9a4j3ccn5v7m1", "FINDB", "dbsystem-fin", "Long running statement"]
      ]
    };
  }

  if (normalized.includes("orders submitted") || normalized.includes("orchestration steps processed")) {
    return {
      columns: [
        "Time",
        "Orders Submitted",
        "DSP operations on orders",
        "Search API calls",
        "Orchestration steps processed",
        "Orchestration processing time (ms)",
        "Orders API response time (seconds)",
        "Orders API timeouts"
      ],
      rows: [
        ["2026-05-11T10:00:00Z", 22, 40, 18, 96, 2810, 1.92, 1],
        ["2026-05-11T10:01:00Z", 24, 44, 20, 102, 2644, 1.75, 0],
        ["2026-05-11T10:02:00Z", 19, 37, 16, 88, 3112, 2.24, 2]
      ]
    };
  }

  return {
    columns: ["Metric", "Value"],
    rows: [
      ["Log Sets Available", mockLogSets.length],
      ["Templates Available", queryTemplates.length],
      ["Mode", "Mock"]
    ]
  };
}
