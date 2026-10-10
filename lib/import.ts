export type RecipeDraft = {
  title: string;
  servings: number | null;
  ingredients: string[];
  steps: string[];
  tags: string[];
  sourceUrl: string;
};

type Node = Record<string, unknown>;

const LD_JSON = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;

export function extractRecipe(html: string, sourceUrl: string): RecipeDraft | null {
  for (const match of html.matchAll(LD_JSON)) {
    const recipe = findRecipe(parseJson(match[1]));
    if (recipe) return toDraft(recipe, html, sourceUrl);
  }
  return null;
}

export function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return (match && clean(match[1])) || null;
}

function parseJson(text: string): unknown {
  const body = text.trim().replace(/^<!\[CDATA\[|\]\]>$/g, "");
  try {
    return JSON.parse(body);
  } catch {
    // Some sites emit raw control characters inside strings; retry with them flattened to spaces.
  }
  try {
    return JSON.parse(body.replace(/[\u0000-\u001f]+/g, " "));
  } catch {
    return undefined;
  }
}

function isRecipe(node: Node): boolean {
  const type = node["@type"];
  return type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
}

function findRecipe(data: unknown, depth = 0): Node | null {
  if (depth > 5 || data === null || typeof data !== "object") return null;
  if (Array.isArray(data)) {
    for (const entry of data) {
      const found = findRecipe(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const node = data as Node;
  if (isRecipe(node)) return node;
  return findRecipe(node["@graph"], depth + 1) ?? findRecipe(node.mainEntity, depth + 1);
}

function toDraft(node: Node, html: string, sourceUrl: string): RecipeDraft {
  return {
    title: text(node.name) || extractTitle(html) || "",
    servings: toServings(node.recipeYield),
    ingredients: asArray(node.recipeIngredient ?? node.ingredients).map(text).filter(Boolean),
    steps: toSteps(node.recipeInstructions),
    tags: toTags(node.keywords),
    sourceUrl,
  };
}

function asArray(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  return typeof value === "string" ? clean(value) : "";
}

function toServings(value: unknown): number | null {
  for (const entry of asArray(value)) {
    const n =
      typeof entry === "number" ? Math.round(entry)
      : typeof entry === "string" ? parseInt(/\d+/.exec(entry)?.[0] ?? "", 10)
      : NaN;
    if (Number.isFinite(n) && n >= 1 && n <= 100) return n;
  }
  return null;
}

function toSteps(value: unknown): string[] {
  if (typeof value === "string") {
    return value.split(/\r?\n|<\/p>|<br\s*\/?>|<\/li>/i).map(clean).filter(Boolean);
  }
  if (Array.isArray(value)) return value.flatMap(toSteps);
  if (value && typeof value === "object") {
    const node = value as Node;
    if (node.itemListElement) return toSteps(node.itemListElement);
    if (typeof node.text === "string") return toSteps(node.text);
    const name = text(node.name);
    return name ? [name] : [];
  }
  return [];
}

function toTags(value: unknown): string[] {
  const raw = typeof value === "string" ? value.split(",") : asArray(value).filter((t): t is string => typeof t === "string");
  return [...new Set(raw.map((t) => clean(t).toLowerCase()).filter(Boolean))].slice(0, 20);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", frac12: "½", frac14: "¼", frac34: "¾",
  deg: "°", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function clean(s: string): string {
  const stripTags = (t: string) => t.replace(/<[^>]*>/g, " ");
  return stripTags(decodeEntities(stripTags(s))).replace(/\s+/g, " ").trim();
}
