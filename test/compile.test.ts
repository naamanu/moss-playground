// @vitest-environment jsdom
// The playground's in-browser compiler wrapper (runtime/index.ts).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compile, examples, initialSource } from "../runtime/index.ts";
import { EXAMPLES } from "../runtime/sources.generated.ts";

type Diag = { severity: { $: string }; line: number; col: number; message: string };
const toArray = <T>(l: { h: T; t: unknown } | null): T[] => {
  const out: T[] = [];
  for (let c = l; c; c = c.t as typeof l) out.push(c.h);
  return out;
};
const run = (src: string) => {
  const [js, diags] = compile(src) as [{ $: string; v?: string }, { h: Diag; t: unknown } | null];
  return { js: js.$ === "Some" ? js.v! : null, diags: toArray(diags) };
};

describe("compile", () => {
  it("compiles every example, including Rhizoid apps", () => {
    for (const [name, src] of Object.entries(EXAMPLES)) {
      const r = run(src);
      expect(r.diags.filter((d) => d.severity.$ === "Error"), name).toEqual([]);
      expect(r.js, name).toContain("export const main");
    }
  });

  it("imports the runtimes the preview frame loads", () => {
    const { js } = run(EXAMPLES.counter!);
    expect(js).toContain(new URL("runtime/core.js", document.baseURI).href);
    expect(js).toContain(new URL("runtime/rhizoid.js", document.baseURI).href);
  });

  it("reports errors with a line and column in the program", () => {
    const r = run('let main =\n  Effect.print (1 + "a")');
    expect(r.js).toBeNull();
    expect(r.diags).toHaveLength(1);
    expect(r.diags[0]).toMatchObject({ severity: { $: "Error" }, line: 2, col: 21 });
    expect(r.diags[0]!.message).toContain("has type string but an expression was expected of type int");
  });

  it("reports warnings without blocking compilation", () => {
    const r = run('let f o = match o with Some _ -> 1 | None -> 2 | Some 3 -> 3\nlet main = Effect.print (show (f None))');
    expect(r.js).not.toBeNull();
    expect(r.diags).toMatchObject([{ severity: { $: "Warning" }, line: 1 }]);
  });

  it("requires a main", () => {
    const r = run("let x = 1");
    expect(r.js).toBeNull();
    expect(r.diags[0]).toMatchObject({ line: 0 });
    expect(r.diags[0]!.message).toContain("no 'main'");
  });
});

describe("examples and sharing", () => {
  it("lists hello first and starts from it", () => {
    expect(toArray(examples as never)[0]).toEqual(["hello", EXAMPLES.hello]);
    expect(initialSource).toBe(EXAMPLES.hello);
  });
});

describe("runtime bundles", () => {
  it("rhizoid.js shares core.js instead of bundling its own copy", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "../public/runtime");
    const rhizoid = readFileSync(join(dir, "rhizoid.js"), "utf8");
    expect(rhizoid).toMatch(/from"\.\/core\.js"/);
    expect(rhizoid).not.toContain("Match failure at");
    expect(readFileSync(join(dir, "core.js"), "utf8")).toContain("Match failure at");
  });
});
