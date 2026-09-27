import { describe, expect, it } from "vitest";
import { extractRecipe, extractTitle } from "./import";

const URL_ = "https://example.com/r";
const script = (body: string) => `<script type="application/ld+json">${body}</script>`;
const page = (...scripts: string[]) => `<html><head><title>Site Title</title>${scripts.join("")}</head><body></body></html>`;

describe("extractRecipe", () => {
  it("reads a plain Recipe object", () => {
    const html = page(
      script(
        JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Recipe",
          name: "Weeknight Pasta",
          recipeYield: "4 servings",
          recipeIngredient: ["1 lb spaghetti", "&frac12; cup parmesan", "Chef&#39;s salt"],
          recipeInstructions: [
            { "@type": "HowToStep", text: "Boil water." },
            { "@type": "HowToStep", text: "Cook pasta &amp; drain." },
          ],
          keywords: "Weeknight, pasta, weeknight",
        }),
      ),
    );
    expect(extractRecipe(html, URL_)).toEqual({
      title: "Weeknight Pasta",
      servings: 4,
      ingredients: ["1 lb spaghetti", "½ cup parmesan", "Chef's salt"],
      steps: ["Boil water.", "Cook pasta & drain."],
      tags: ["weeknight", "pasta"],
      sourceUrl: URL_,
    });
  });

  it("finds a Recipe inside @graph with an array @type and sectioned steps", () => {
    const html = page(
      script(
        JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "WebPage", name: "Page" },
            {
              "@type": ["Recipe", "NewsArticle"],
              name: "Chili",
              recipeYield: ["6", "6 servings"],
              recipeIngredient: ["1 onion"],
              recipeInstructions: [
                { "@type": "HowToSection", name: "Base", itemListElement: [{ "@type": "HowToStep", text: "Chop onion." }] },
                { "@type": "HowToSection", name: "Finish", itemListElement: [{ "@type": "HowToStep", text: "Simmer." }] },
              ],
              keywords: ["Dinner", "Spicy"],
            },
          ],
        }),
      ),
    );
    expect(extractRecipe(html, URL_)).toMatchObject({ title: "Chili", servings: 6, steps: ["Chop onion.", "Simmer."], tags: ["dinner", "spicy"] });
  });

  it("reads a top-level array and splits an HTML instruction string", () => {
    const html = page(
      script(
        JSON.stringify([
          { "@type": "Organization", name: "Blog" },
          { "@type": "Recipe", name: "Cookies", recipeYield: 12, recipeIngredient: ["2 cups flour"], recipeInstructions: "<p>Mix.</p><p>Bake 30 min.</p>" },
        ]),
      ),
    );
    expect(extractRecipe(html, URL_)).toMatchObject({ title: "Cookies", servings: 12, steps: ["Mix.", "Bake 30 min."] });
  });

  it("skips a broken JSON-LD block and uses the next one", () => {
    const html = page(script("{ not json"), script(JSON.stringify({ "@type": "Recipe", name: "Soup", recipeIngredient: ["1 onion"] })));
    expect(extractRecipe(html, URL_)).toMatchObject({ title: "Soup", ingredients: ["1 onion"] });
  });

  it("tolerates raw newlines inside JSON strings", () => {
    const html = page(script(`{"@type":"Recipe","name":"Line\nBreak","recipeIngredient":["1 egg"]}`));
    expect(extractRecipe(html, URL_)).toMatchObject({ title: "Line Break" });
  });

  it("falls back to the page title and handles missing or unusable yields", () => {
    const noYield = page(script(JSON.stringify({ "@type": "Recipe", recipeIngredient: ["1 egg"] })));
    expect(extractRecipe(noYield, URL_)).toMatchObject({ title: "Site Title", servings: null, steps: [], tags: [] });

    const cookies = page(script(JSON.stringify({ "@type": "Recipe", name: "C", recipeYield: "Makes about 24 cookies" })));
    expect(extractRecipe(cookies, URL_)?.servings).toBe(24);

    const huge = page(script(JSON.stringify({ "@type": "Recipe", name: "C", recipeYield: "Serves 200" })));
    expect(extractRecipe(huge, URL_)?.servings).toBeNull();
  });

  it("returns null when there is no Recipe", () => {
    expect(extractRecipe(page(script(JSON.stringify({ "@type": "WebPage" }))), URL_)).toBeNull();
    expect(extractRecipe("<html><body>hi</body></html>", URL_)).toBeNull();
  });
});

describe("extractTitle", () => {
  it("decodes the <title>", () => {
    expect(extractTitle("<title>Grandma&#39;s  Page</title>")).toBe("Grandma's Page");
    expect(extractTitle("<html></html>")).toBeNull();
  });
});
