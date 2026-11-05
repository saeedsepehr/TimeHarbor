import {
  MAX_DOCUMENT_BYTES,
  validateDocument,
  documentName,
} from "./sync-policy.ts";
import type { SyncDocument } from "./sync-policy.ts";
export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
}
export async function boundedJson(
  response: Response,
  limit: number,
): Promise<unknown> {
  if (!response.ok)
    throw Error(
      response.status === 401
        ? "GOOGLE_AUTH_REQUIRED"
        : "Remote request failed",
    );
  const reader = response.body?.getReader();
  if (!reader) throw Error("Empty remote response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > limit) throw Error("Remote response too large");
      chunks.push(item.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(all));
}
export class GoogleDrive {
  private readonly accessToken: string;
  private readonly fetchImpl: typeof fetch;
  constructor(accessToken: string, fetchImpl: typeof fetch = fetch) {
    this.accessToken = accessToken;
    this.fetchImpl = fetchImpl;
  }
  private async request(
    url: string,
    init: RequestInit = {},
  ): Promise<Response> {
    return this.fetchImpl(url, {
      ...init,
      headers: { ...init.headers, Authorization: "Bearer " + this.accessToken },
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
  }
  async list(): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken = "";
    for (let page = 0; page < 10; page++) {
      const url = new URL("https://www.googleapis.com/drive/v3/files");
      url.search = new URLSearchParams({
        spaces: "appDataFolder",
        q: "trashed = false and name contains 'timeharbor-v1_'",
        pageSize: "1000",
        fields: "nextPageToken,files(id,name,modifiedTime,size)",
        ...(pageToken ? { pageToken } : {}),
      }).toString();
      const data = (await boundedJson(
        await this.request(url.href),
        2_097_152,
      )) as { files?: DriveFile[]; nextPageToken?: string };
      if (!Array.isArray(data.files)) throw Error("Invalid Drive index");
      for (const file of data.files)
        if (
          /^[\w-]{1,200}$/.test(file.id) &&
          /^timeharbor-v1_[a-f0-9]{32}_(settings|\d{4}-\d{2}-\d{2})\.json$/.test(
            file.name,
          ) &&
          typeof file.modifiedTime === "string"
        )
          files.push(file);
      pageToken = data.nextPageToken ?? "";
      if (!pageToken) return files;
    }
    throw Error("Drive sync index limit reached");
  }
  async read(file: DriveFile): Promise<SyncDocument> {
    if (
      !/^[\w-]{1,200}$/.test(file.id) ||
      Number(file.size ?? 0) > MAX_DOCUMENT_BYTES
    )
      throw Error("Invalid Drive file");
    const doc = validateDocument(
      await boundedJson(
        await this.request(
          "https://www.googleapis.com/drive/v3/files/" + file.id + "?alt=media",
        ),
        MAX_DOCUMENT_BYTES,
      ),
    );
    if (documentName(doc) !== file.name)
      throw Error("Drive filename does not match its document");
    return doc;
  }
  async write(doc: SyncDocument, file?: DriveFile): Promise<DriveFile> {
    const text = JSON.stringify(doc);
    if (new TextEncoder().encode(text).length > MAX_DOCUMENT_BYTES)
      throw Error("Sync document too large");
    const name = documentName(doc),
      boundary = "timeharbor-" + crypto.randomUUID();
    if (file && (!/^[\w-]{1,200}$/.test(file.id) || file.name !== name))
      throw Error("Invalid Drive destination");
    const metadata = file
      ? { name, mimeType: "application/json" }
      : { name, mimeType: "application/json", parents: ["appDataFolder"] };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--`;
    const url =
      "https://www.googleapis.com/upload/drive/v3/files" +
      (file ? "/" + file.id : "") +
      "?uploadType=multipart&fields=id,name,modifiedTime,size";
    const result = (await boundedJson(
      await this.request(url, {
        method: file ? "PATCH" : "POST",
        headers: { "Content-Type": "multipart/related; boundary=" + boundary },
        body,
      }),
      65536,
    )) as DriveFile;
    if (
      result.name !== name ||
      !/^[\w-]{1,200}$/.test(result.id) ||
      typeof result.modifiedTime !== "string"
    )
      throw Error("Invalid Drive write response");
    return result;
  }
}
