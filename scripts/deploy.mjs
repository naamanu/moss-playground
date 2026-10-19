// Publish the built playground (dist/) to this repository's `gh-pages`
// branch, which GitHub Pages serves. The branch holds only build output, as a
// single commit replaced on every deploy.
//
//   npm run deploy        (builds first)
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
if (!existsSync(join(dist, "index.html"))) throw new Error("dist/ is missing: run `npm run build` first");

const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" }).trim();
const remote = git(root, "remote", "get-url", "origin");
const source = git(root, "rev-parse", "--short", "HEAD");
const dirty = git(root, "status", "--porcelain") !== "";

const work = mkdtempSync(join(tmpdir(), "moss-pages-"));
try {
  cpSync(dist, work, { recursive: true });
  writeFileSync(join(work, ".nojekyll"), ""); // serve files as-is
  git(work, "init", "--quiet", "--initial-branch", "gh-pages");
  git(work, "add", "-A");
  git(work, "commit", "--quiet", "-m", `Deploy playground ${source}${dirty ? " (with uncommitted changes)" : ""}`);
  git(work, "push", "--quiet", "--force", remote, "gh-pages");
  console.log(`deployed playground ${source} to the gh-pages branch of ${remote}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
