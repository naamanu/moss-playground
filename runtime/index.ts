// Externals of the playground's `Api` module (src/api.moss): the in-browser
// compiler, the preview frame that runs programs, and URL sharing.
//
// Values handed to Moss use Moss representations: lists are cons cells,
// variants `{ $, i, v }` (indices in declaration order), records plain objects
// with fields in declaration order, tuples arrays.

import { MossError, compile as compileMoss, fileNameOf } from "mosslang/compiler";
import { Eff } from "mosslang/runtime/effect.ts";
import { type List, None, Some, list } from "mosslang/runtime/prelude.ts";
import { frameHooks } from "rhizoid/runtime/comp.ts";
import { Var } from "rhizoid/runtime/incr.ts";
import * as RhizoidRuntime from "rhizoid/runtime/index.ts";
import { EXAMPLES, RHIZOID } from "./sources.generated.ts";

// ---------------------------------------------------------------------------
// Compiling

/** `type severity = Error | Warning` */
const Error_ = { $: "Error", i: 0 } as const;
const Warning = { $: "Warning", i: 1 } as const;

/** `type diagnostic = { severity; line; col; message }` (line 0: no position) */
interface Diagnostic {
  severity: typeof Error_ | typeof Warning;
  line: number;
  col: number;
  message: string;
}

const FILE = "main.moss";

/** Where programs in the preview frame load the runtimes from. */
const runtimeUrl = (name: string) => new URL(`runtime/${name}.js`, document.baseURI).href;

function diagnostic(e: MossError, severity: Diagnostic["severity"], source: string): Diagnostic {
  let line = 0;
  let col = 0;
  if (e.span?.file === FILE) {
    const before = source.slice(0, e.span.start);
    line = before.split("\n").length;
    col = e.span.start - before.lastIndexOf("\n");
  } else if (e.span) {
    e = new MossError(`${e.span.file}: ${e.message}`, e.span);
  }
  return { severity, line, col, message: e.message };
}

/** `compile : string -> string option * diagnostic list`: JS for the preview, and errors/warnings. */
export function compile(source: string): [unknown, List<Diagnostic>] {
  const rhizoid = runtimeUrl("rhizoid");
  const diagnostics: Diagnostic[] = [];
  try {
    const js = compileMoss(source, FILE, {
      loader: (m) => (RHIZOID[m] === undefined ? undefined : { file: `rhizoid/${fileNameOf(m)}`, source: RHIZOID[m]!, runtime: rhizoid }),
      runtimeImport: runtimeUrl("core"),
      runtimeExports: { [rhizoid]: RhizoidRuntime as Record<string, unknown> },
      requireMain: true,
      onWarning: (w) => diagnostics.push(diagnostic(w, Warning, source)),
    });
    return [Some(js), list(...diagnostics)];
  } catch (e) {
    const err = e instanceof MossError ? e : new MossError(`internal compiler error: ${(e as Error).message}`, undefined);
    return [None, list(diagnostic(err, Error_, source), ...diagnostics)];
  }
}

// ---------------------------------------------------------------------------
// Running

type Line = [kind: string, text: string];
const lines: Line[] = [];
const MAX_LINES = 500;

/** `console_lines : (string * string) list val`: ("out" | "err" | "info", text), oldest first. */
export const consoleLines = new Var<List<Line>>(null);

function publish(): void {
  frameHooks.perform(new Eff(() => consoleLines.set(list(...lines))));
}

function append(kind: string, text: string): void {
  lines.push([kind, text]);
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  publish();
}

let listening = false;
function listen(): void {
  if (listening) return;
  listening = true;
  window.addEventListener("message", (e: MessageEvent) => {
    const frame = document.getElementById("preview") as HTMLIFrameElement | null;
    if (!frame || e.source !== frame.contentWindow) return;
    const d = e.data as { moss?: boolean; kind?: string; text?: string };
    if (d?.moss && typeof d.text === "string") append(d.kind === "err" ? "err" : "out", d.text);
  });
}

/**
 * The page loaded into the preview frame. The frame is sandboxed
 * (`allow-scripts` only), so it has an opaque origin: the program can't reach
 * the playground or anything else on its domain. It loads the runtime bundles
 * cross-origin (which needs `Access-Control-Allow-Origin`; GitHub Pages and
 * `moss dev` send it) and reports output and errors with postMessage.
 */
function frameDocument(js: string): string {
  // The program is inlined (a sandboxed frame can't load the parent's blob:
  // URLs). Strings in compiled code can contain "</script>": escape it.
  const program = `${js}\nR.runMain(main);\n`.replace(/<\/(script)/gi, "<\\/$1");
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 12px; color: #1f2328; }
  button { font: inherit; padding: 2px 10px; }
  input { font: inherit; }
</style>
<script>
  const send = (kind, text) => parent.postMessage({ moss: true, kind, text }, "*");
  const show = (x) => (typeof x === "string" ? x : JSON.stringify(x));
  console.log = (...a) => send("out", a.map(show).join(" "));
  addEventListener("error", (e) => send("err", e.message || "error loading the program"));
  addEventListener("unhandledrejection", (e) => send("err", String(e.reason?.message ?? e.reason)));
</script></head>
<body><div id="app"></div>
<script type="module">
${program}
</script></body></html>`;
}

/** `run : string -> unit effect`: run compiled JS in the preview frame, with a fresh console. */
export function run(js: string): Eff {
  return new Eff(() => {
    listen();
    lines.length = 0;
    append("info", "Running…");
    const frame = document.getElementById("preview") as HTMLIFrameElement;
    frame.srcdoc = frameDocument(js);
  });
}

// ---------------------------------------------------------------------------
// Examples, sharing, editor

/** `examples : (string * string) list`: (name, source), hello first. */
export const examples: List<[string, string]> = list(
  ...Object.entries(EXAMPLES).sort(([a], [b]) => (a === "hello" ? -1 : b === "hello" ? 1 : a < b ? -1 : 1)),
);

const encode = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

/** `initial_source : string`: the program in the URL (`#code=...`), else the hello example. */
export const initialSource: string = (() => {
  const m = /^#code=(.+)$/.exec(typeof location === "undefined" ? "" : location.hash);
  if (m) {
    try {
      return decode(m[1]!);
    } catch {
      /* fall through to the default */
    }
  }
  return EXAMPLES.hello ?? "";
})();

/** `share : string -> unit effect`: put the program in the URL and copy the link. */
export function share(source: string): Eff {
  return new Eff(() => {
    history.replaceState(null, "", `#code=${encode(source)}`);
    void navigator.clipboard?.writeText(location.href).catch(() => {});
  });
}

/** `focus_at : int -> int -> unit effect`: put the editor's cursor at line/col (1-based). */
export function focusAt(line: number, col: number): Eff {
  return new Eff(() => {
    const ed = document.getElementById("editor") as HTMLTextAreaElement | null;
    if (!ed || line < 1) return;
    const rows = ed.value.split("\n");
    let offset = 0;
    for (let i = 0; i < line - 1 && i < rows.length; i++) offset += rows[i]!.length + 1;
    offset += Math.max(0, col - 1);
    ed.focus();
    ed.setSelectionRange(offset, offset);
    // Scroll the line into view (approximately: the textarea has a fixed line height).
    const lh = parseFloat(getComputedStyle(ed).lineHeight) || 20;
    ed.scrollTop = Math.max(0, (line - 4) * lh);
  });
}
