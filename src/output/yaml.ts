import { stringify } from "yaml";
import type { ScanResult } from "../types.js";

export function formatYaml(result: ScanResult): string {
  return stringify(result);
}
