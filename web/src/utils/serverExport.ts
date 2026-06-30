import { dump, load } from "js-yaml";

export interface ServerExportItem {
  name: string;
  address: string;
  labels?: Record<string, unknown> | string;
}

export interface ServerExportBundle {
  format: string;
  version: number;
  exported_at: string;
  on_conflict?: "skip" | "update";
  servers: ServerExportItem[];
}

export function bundleToYAML(bundle: ServerExportBundle): string {
  return dump(bundle, { lineWidth: 120, noRefs: true });
}

export function parseServerImportFile(text: string): ServerExportBundle {
  const data = load(text) as ServerExportBundle | null;
  if (!data || typeof data !== "object") {
    throw new Error("无法解析 YAML 文件");
  }
  if (!Array.isArray(data.servers) || data.servers.length === 0) {
    throw new Error("文件中没有可导入的服务（servers 为空）");
  }
  return {
    format: data.format || "nginx-admin-servers",
    version: data.version || 1,
    exported_at: data.exported_at || "",
    servers: data.servers,
  };
}

export function downloadServerYAML(
  yamlText: string,
  filename?: string
) {
  const name =
    filename ||
    `nginx-admin-servers-${new Date().toISOString().slice(0, 10)}.yaml`;
  const blob = new Blob([yamlText], {
    type: "application/yaml;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
