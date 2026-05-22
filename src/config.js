import path from "node:path";
import os from "node:os";
import { config as loadEnv } from "dotenv";

loadEnv();

const homeDir = os.homedir();

function resolveMaybeHome(input) {
  if (!input) {
    return input;
  }

  return input.startsWith("~/") ? path.join(homeDir, input.slice(2)) : input;
}

export const appConfig = {
  port: Number(process.env.PORT || 4310),
  host: process.env.HOST || "127.0.0.1",
  allowedHosts: (process.env.APP_ALLOWED_HOSTS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
  mockMode: String(process.env.MOCK_MODE || "true").toLowerCase() === "true",
  authMode: process.env.OCI_AUTH_MODE || "config",
  region: process.env.OCI_REGION || "",
  namespace: process.env.OCI_LOG_ANALYTICS_NAMESPACE || "",
  compartmentId: process.env.OCI_LOG_ANALYTICS_COMPARTMENT_OCID || "",
  logGroupId: process.env.OCI_LOG_ANALYTICS_LOG_GROUP_ID || "",
  configFile: resolveMaybeHome(process.env.OCI_CONFIG_FILE || "~/.oci/config"),
  configProfile: process.env.OCI_CONFIG_PROFILE || "DEFAULT",
  tenancyId: process.env.OCI_TENANCY_OCID || "",
  userId: process.env.OCI_USER_OCID || "",
  fingerprint: process.env.OCI_FINGERPRINT || "",
  privateKeyPath: resolveMaybeHome(process.env.OCI_PRIVATE_KEY_PATH || ""),
  passphrase: process.env.OCI_PASSPHRASE || ""
};

export function hasDirectAuthConfig() {
  return Boolean(
    appConfig.region &&
      appConfig.tenancyId &&
      appConfig.userId &&
      appConfig.fingerprint &&
      appConfig.privateKeyPath
  );
}
