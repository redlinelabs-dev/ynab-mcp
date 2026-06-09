import type { OAuthStorage } from "./worker-config.js";

export interface WorkerKV {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
}

export function parseScope(params: URLSearchParams): "read-only" | "full" {
  return params.get("scope") === "write" ? "full" : "read-only";
}

export function kvStorage(kv: WorkerKV): OAuthStorage {
  return {
    get: (key) => kv.get(key, "json"),
    put: (key, val) => kv.put(key, JSON.stringify(val)),
  };
}
