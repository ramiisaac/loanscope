import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/tables.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "./loanscope.db",
  },
});
