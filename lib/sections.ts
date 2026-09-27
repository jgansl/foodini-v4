import { normalizeItemName } from "./ingredients";

export const SECTIONS = [
  "produce",
  "meat & seafood",
  "dairy & eggs",
  "bakery",
  "frozen",
  "pantry",
  "spices",
  "beverages",
  "other",
] as const;
export type Section = (typeof SECTIONS)[number];

// Keywords are in normalized (singular) form. When several keywords match, the one with the most
// words wins ("green bean" over "bean"); on a tie, the section listed first here wins, which is
// why frozen/spices/pantry come before meat and produce ("chicken broth" → pantry).
const KEYWORDS: [Section, string[]][] = [
  ["frozen", ["frozen", "ice cream"]],
  ["spices", [
    "salt", "black pepper", "pepper flake", "peppercorn", "cumin", "paprika", "cinnamon", "nutmeg", "oregano",
    "dried", "chili powder", "garlic powder", "onion powder", "curry powder", "turmeric", "coriander",
    "cardamom", "allspice", "bay leaf", "cayenne", "vanilla", "vanilla extract", "spice", "seasoning",
  ]],
  ["pantry", [
    "flour", "sugar", "rice", "pasta", "spaghetti", "noodle", "oat", "bread crumb", "breadcrumb", "panko",
    "broth", "stock", "oil", "vinegar", "soy sauce", "sauce", "ketchup", "mustard", "mayonnaise", "honey",
    "syrup", "baking soda", "baking powder", "yeast", "cornstarch", "bean", "lentil", "chickpea", "canned",
    "tomato paste", "coconut milk", "peanut butter", "nut", "almond", "walnut", "pecan", "raisin",
    "chocolate", "cocoa", "jam", "cracker", "cereal", "quinoa", "couscous",
  ]],
  ["meat & seafood", [
    "chicken", "beef", "pork", "bacon", "sausage", "ham", "turkey", "lamb", "steak", "ground", "salmon",
    "tuna", "shrimp", "fish", "cod", "prosciutto", "chorizo", "anchovy",
  ]],
  ["dairy & eggs", [
    "milk", "butter", "cheese", "cream", "yogurt", "egg", "parmesan", "mozzarella", "cheddar", "feta",
    "ricotta", "sour cream", "half-and-half", "buttermilk",
  ]],
  ["bakery", ["bread", "bun", "roll", "tortilla", "pita", "bagel", "baguette", "naan", "croissant"]],
  ["produce", [
    "onion", "garlic", "tomato", "potato", "sweet potato", "carrot", "celery", "lettuce", "spinach", "kale",
    "pepper", "bell pepper", "jalapeno", "cucumber", "zucchini", "squash", "mushroom", "broccoli",
    "cauliflower", "cabbage", "lemon", "lime", "orange", "apple", "banana", "berry", "strawberry",
    "blueberry", "avocado", "ginger", "cilantro", "parsley", "basil", "mint", "thyme", "rosemary",
    "scallion", "green onion", "shallot", "leek", "corn", "pea", "eggplant", "herb", "grape", "peach",
    "pear", "mango", "pineapple", "asparagus", "green bean", "arugula",
  ]],
  ["beverages", ["wine", "beer", "juice", "coffee", "tea", "soda", "sparkling water"]],
];

export function sectionFor(name: string): Section {
  const padded = ` ${normalizeItemName(name)} `;
  let best: { section: Section; words: number } | null = null;
  for (const [section, keywords] of KEYWORDS) {
    for (const keyword of keywords) {
      if (!padded.includes(` ${keyword} `)) continue;
      const words = keyword.split(" ").length;
      if (!best || words > best.words) best = { section, words };
    }
  }
  return best?.section ?? "other";
}
