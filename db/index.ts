import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");

// Reuse one connection pool across dev hot reloads.
const globalForDb = globalThis as unknown as { foodiniSql?: ReturnType<typeof postgres> };
// prepare: false keeps this compatible with Supabase's transaction pooler in production.
export const sqlClient = globalForDb.foodiniSql ?? postgres(url, { prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.foodiniSql = sqlClient;

export const db = drizzle(sqlClient, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
