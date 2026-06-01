import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";

export class MemoryStream extends Writable {
  private readonly chunks: string[] = [];

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk);
    callback();
  }

  text(): string {
    return this.chunks.join("");
  }
}

export async function createTempProject(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), "failure-packager-"));
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "fixture-project", packageManager: "npm@10.0.0" }, null, 2),
    "utf8"
  );
  await writeFile(path.join(dir, "package-lock.json"), JSON.stringify({ lockfileVersion: 3 }), "utf8");

  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true })
  };
}
