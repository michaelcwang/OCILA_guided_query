import fs from "node:fs/promises";
import { appConfig, hasDirectAuthConfig } from "./config.js";
import {
  mockFieldSummary,
  mockFieldValues,
  mockFields,
  mockLogSets,
  buildMockResults
} from "./mock-data.js";

let ociModulePromise;

async function loadOciSdk() {
  if (!ociModulePromise) {
    ociModulePromise = import("oci-sdk");
  }

  return ociModulePromise;
}

async function buildAuthProvider() {
  const oci = await loadOciSdk();

  if (appConfig.authMode === "config") {
    const provider = new oci.ConfigFileAuthenticationDetailsProvider(
      appConfig.configFile,
      appConfig.configProfile
    );
    return provider;
  }

  if (!hasDirectAuthConfig()) {
    throw new Error("Direct OCI auth is selected, but required env vars are missing.");
  }

  const privateKey = await fs.readFile(appConfig.privateKeyPath, "utf8");
  return new oci.SimpleAuthenticationDetailsProvider(
    appConfig.tenancyId,
    appConfig.userId,
    appConfig.fingerprint,
    privateKey,
    appConfig.passphrase || null
  );
}

async function createClient() {
  const oci = await loadOciSdk();
  const provider = await buildAuthProvider();
  const client = new oci.loganalytics.LogAnalyticsClient({
    authenticationDetailsProvider: provider
  });

  if (appConfig.region) {
    client.regionId = appConfig.region;
  }

  return client;
}

function buildNamespaceGuard() {
  if (!appConfig.namespace) {
    throw new Error("OCI_LOG_ANALYTICS_NAMESPACE is required when MOCK_MODE=false.");
  }
}

function buildCompartmentGuard() {
  if (!appConfig.compartmentId) {
    throw new Error("OCI_LOG_ANALYTICS_COMPARTMENT_OCID is required when MOCK_MODE=false.");
  }
}

export async function listLogSets() {
  if (appConfig.mockMode) {
    return mockLogSets;
  }

  buildNamespaceGuard();
  const client = await createClient();
  const response = await client.listLogSets({
    namespaceName: appConfig.namespace,
    limit: 1000
  });

  const items = response?.logSetCollection?.items || [];
  return items.map((item) => ({
    name: item,
    displayName: item
  }));
}

export async function listFields() {
  if (appConfig.mockMode) {
    return mockFields;
  }

  buildNamespaceGuard();
  const client = await createClient();
  const response = await client.listFields({
    namespaceName: appConfig.namespace,
    limit: 1000,
    sortBy: "name",
    sortOrder: "ASC"
  });

  const items = response?.logAnalyticsFieldCollection?.items || [];
  return items
    .map((item) => ({
      name: item.name || item.internalName || item.displayName,
      displayName: item.displayName || item.name || item.internalName,
      dataType: item.dataType || "UNKNOWN",
      description: item.description || "",
      isFacetEligible: Boolean(item.isFacetEligible),
      rangeFacetEligible: Boolean(item.rangeFacetEligible),
      isMetricKeyEligible: Boolean(item.isMetricKeyEligible),
      isMetricValueEligible: Boolean(item.isMetricValueEligible),
      isTableEligible: Boolean(item.isTableEligible),
      isSummarizable: Boolean(item.isSummarizable),
      isSystem: Boolean(item.isSystem),
      isPrimary: Boolean(item.isPrimary),
      isHighCardinality: Boolean(item.isHighCardinality),
      isLargeData: Boolean(item.isLargeData)
    }))
    .filter((item) => item.displayName);
}

export async function getFieldSummary() {
  if (appConfig.mockMode) {
    return mockFieldSummary;
  }

  buildNamespaceGuard();
  const client = await createClient();
  const response = await client.getFieldsSummary({
    namespaceName: appConfig.namespace
  });

  return response?.fieldSummaryReport || {
    oobCount: 0,
    nonOobCount: 0,
    usageDetails: []
  };
}

export async function suggest({ input, caretPosition = 0 }) {
  if (appConfig.mockMode) {
    const target = input.split("=").at(-1)?.trim().replaceAll("'", "") || "";
    const fieldMatches = mockFields
      .filter((field) =>
        (field.displayName || field.name || "").toLowerCase().includes(target.toLowerCase())
      )
      .slice(0, 8)
      .map((field) => ({ type: "field", value: field.displayName || field.name }));
    const valueMatches = Object.entries(mockFieldValues)
      .flatMap(([field, values]) =>
        values
          .filter((value) => value.toLowerCase().includes(target.toLowerCase()))
          .map((value) => ({ type: "value", field, value }))
      )
      .slice(0, 8);

    return [...fieldMatches, ...valueMatches];
  }

  buildNamespaceGuard();
  buildCompartmentGuard();
  const client = await createClient();
  const response = await client.suggest({
    namespaceName: appConfig.namespace,
    suggestDetails: {
      compartmentId: appConfig.compartmentId,
      queryString: input,
      subSystem: "LOG"
    }
  });

  const output = response?.suggestOutput || {};
  const groups = [
    ["command", output.commands || []],
    ["field", output.fields || []],
    ["value", output.fieldValues || []],
    ["term", output.terms || []],
    ["option", output.options || []],
    ["example", output.examples || []]
  ];

  return groups
    .flatMap(([type, values]) => values.map((value) => ({ type, value, caretPosition })))
    .slice(0, 40);
}

export async function runQuery({ queryText, timeStart, timeEnd }) {
  if (appConfig.mockMode) {
    return buildMockResults(queryText);
  }

  buildNamespaceGuard();
  buildCompartmentGuard();
  const client = await createClient();
  const response = await client.query({
    namespaceName: appConfig.namespace,
    queryDetails: {
      compartmentId: appConfig.compartmentId,
      queryString: queryText,
      subSystem: "LOG",
      timeFilter: {
        timeStart,
        timeEnd
      },
      shouldIncludeColumns: true,
      shouldIncludeFields: true,
      shouldIncludeTotalCount: true,
      maxTotalCount: 500
    }
  });

  const content = response?.queryAggregation || {};
  const columns = (content?.columns || []).map(
    (column) => column.displayName || column.name || column.internalName
  );
  const rows = content?.items || [];

  return {
    columns: columns.length ? columns : Object.keys(rows[0] || {}),
    rows: Array.isArray(rows)
      ? rows.map((row) => (Array.isArray(row) ? row : Object.values(row)))
      : []
  };
}
