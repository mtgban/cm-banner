import { test, expect } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "fs";

const root = new URL("../", import.meta.url);

test("no em dash in the repository's own docs", () => {
  const names = ["README.md", "AGENTS.md"];
  if (existsSync(new URL("docs/", root))) {
    names.push(...readdirSync(new URL("docs/", root)).map((name) => "docs/" + name));
  }
  const dashed = names.filter((name) => readFileSync(new URL(name, root), "utf8").includes("—"));
  expect(dashed).toEqual([]);
});

test("every site keeps its own rules and specification", () => {
  const sites = readdirSync(new URL("sites/", root));
  expect(sites.length).toBeGreaterThan(0);
  const missing = sites.flatMap((site) =>
    ["AGENTS.md", "SPECIFICATIONS.md", "manifest.json"]
      .map((name) => "sites/" + site + "/" + name)
      .filter((path) => !existsSync(new URL(path, root))),
  );
  expect(missing).toEqual([]);
});
