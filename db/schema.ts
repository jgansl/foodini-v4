import { sql } from "drizzle-orm";
import { check, index, integer, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// user_id columns reference auth.users; the foreign keys live in the custom RLS migration
// because drizzle-kit only manages the public schema.

export const unitKindEnum = pgEnum("unit_kind", ["count", "volume", "weight"]);

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    /** normalizeItemName(name): the per-user matching key. */
    key: text("key").notNull(),
    section: text("section").notNull(),
    unitKind: unitKindEnum("unit_kind").notNull(),
  },
  (t) => [uniqueIndex("items_user_key_idx").on(t.userId, t.key)],
);

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    title: text("title").notNull(),
    servings: integer("servings").notNull(),
    steps: text("steps").array().notNull().default(sql`'{}'::text[]`),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    sourceUrl: text("source_url"),
    imagePath: text("image_path"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("recipes_user_updated_idx").on(t.userId, t.updatedAt),
    check("recipes_servings_positive", sql`${t.servings} > 0`),
  ],
);

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    recipeId: uuid("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    rawText: text("raw_text").notNull(),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    quantity: numeric("quantity", { mode: "number" }),
    unit: text("unit"),
    note: text("note"),
  },
  (t) => [index("recipe_ingredients_recipe_idx").on(t.recipeId, t.position)],
);
