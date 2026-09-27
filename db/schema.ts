import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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

export const planEntries = pgTable(
  "plan_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    /** Calendar day, "YYYY-MM-DD". */
    date: date("date", { mode: "string" }).notNull(),
    position: integer("position").notNull(),
    // NO ACTION (the default) blocks deleting a planned recipe like RESTRICT, but is checked at the end of
    // the statement, so deleting a user cascades through recipes and plan entries in any order.
    recipeId: uuid("recipe_id").notNull().references(() => recipes.id),
    servings: numeric("servings", { mode: "number" }).notNull(),
    label: text("label"),
    cookedAt: timestamp("cooked_at", { withTimezone: true }),
    /** Phase 4: item id → amount taken from inventory when cooked. */
    deducted: jsonb("deducted").$type<Record<string, number>>(),
  },
  (t) => [
    index("plan_entries_user_date_idx").on(t.userId, t.date, t.position),
    index("plan_entries_recipe_idx").on(t.recipeId),
    check("plan_entries_servings_positive", sql`${t.servings} > 0`),
  ],
);

export const groceryMarks = pgTable(
  "grocery_marks",
  {
    userId: uuid("user_id").notNull(),
    /** Monday of the list's week, "YYYY-MM-DD". */
    weekStart: date("week_start", { mode: "string" }).notNull(),
    /** Line key: item:<id>:<unitKey> or raw:<text> (see lib/grocery.ts). */
    key: text("key").notNull(),
    checked: boolean("checked").notNull().default(false),
    /** Amount bought, in base units (ml, g or count). Null for lines without an amount. */
    checkedQty: numeric("checked_qty", { mode: "number" }),
    hidden: boolean("hidden").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.weekStart, t.key] })],
);

export const groceryExtras = pgTable(
  "grocery_extras",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    quantity: numeric("quantity", { mode: "number" }),
    unit: text("unit"),
    checked: boolean("checked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("grocery_extras_user_week_idx").on(t.userId, t.weekStart)],
);
