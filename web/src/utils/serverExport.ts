import type { ServerExportBundle } from "../api/client";

export function downloadServerBundle(bundle: ServerExportBundle, filename?: string) {
  const name =
    filename ||
    `nginx-admin-servers-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseServerImportFile(text: string): ServerExportBundle {
  const data = JSON.parse(text) as ServerExportBundle & {
    servers?: ServerExportBundle["servers"];
  };
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
