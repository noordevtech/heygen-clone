import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __pg__: Sql | undefined;
  // eslint-disable-next-line no-var
  var __drizzle__: PostgresJsDatabase<typeof schema> | undefined;
}

function client(): Sql {
  if (!global.__pg__) {
    global.__pg__ = postgres(env.databaseUrl(), {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 30,
      prepare: false,
    });
  }
  return global.__pg__;
}

/**
 * Lazy proxy: defer creating the postgres connection until the first call,
 * so importing this module during `next build` (which doesn't have
 * DATABASE_URL set) doesn't crash.
 */
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_t, prop, receiver) {
    if (!global.__drizzle__) {
      global.__drizzle__ = drizzle(client(), { schema });
    }
    return Reflect.get(global.__drizzle__, prop, receiver);
  },
});

export { schema };
