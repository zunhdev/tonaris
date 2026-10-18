// Reads the design tokens from tokens.css, the single source of truth, for the token tests (DS-10, DS-14).

import path from "node:path";

import { type Oklch, parseOklch } from "./color";

export const tokensPath = path.join(import.meta.dir, "tokens.css");

export type Tokens = {
  /** Layer 1, from the first `:root` block: name → raw value. */
  primitives: Map<string, string>;
  /** Layer 2, from the `[data-theme="dark"]` block: name → raw value. */
  semantic: Map<string, string>;
  /** Resolves a token through `var()` references to its color. */
  color(name: string): Oklch;
};

const blockPattern = /^(:root|\[data-theme="dark"\])\s*\{([^}]*)\}/gm;
const declarationPattern = /^\s*--([\w-]+):\s*([^;]+);/gm;
const reference = /^var\(--([\w-]+)\)$/;

function declarations(body: string | undefined): Map<string, string> {
  return new Map(
    [...(body ?? "").matchAll(declarationPattern)].map(([, name, value]) => [
      name ?? "",
      (value ?? "").trim(),
    ]),
  );
}

export function parseTokens(css: string): Tokens {
  const blocks = [...css.matchAll(blockPattern)];
  const primitives = declarations(blocks.find(([, selector]) => selector === ":root")?.[2]);
  const semantic = declarations(
    blocks.find(([, selector]) => selector === '[data-theme="dark"]')?.[2],
  );

  const color = (name: string, seen: string[] = []): Oklch => {
    if (seen.includes(name)) throw new Error(`Token cycle: ${[...seen, name].join(" → ")}`);
    const value = semantic.get(name) ?? primitives.get(name);
    if (value === undefined) throw new Error(`Unknown token --${name}`);
    const target = reference.exec(value)?.[1];
    return target ? color(target, [...seen, name]) : parseOklch(value);
  };
  return { primitives, semantic, color: (name) => color(name) };
}

export async function readTokens(): Promise<Tokens> {
  return parseTokens(await Bun.file(tokensPath).text());
}
