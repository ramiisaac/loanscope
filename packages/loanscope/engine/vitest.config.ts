import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/__tests__/*.test.ts"],
  },
  resolve: {
    alias: {
      "@loanscope/domain": resolve(__dirname, "../domain/src/index.ts"),
      "@loanscope/graph": resolve(__dirname, "../graph/src/index.ts"),
      "@loanscope/math": resolve(__dirname, "../math/src/index.ts"),
      "@loanscope/calculations": resolve(__dirname, "../calculations/src/index.ts"),
      "@loanscope/products": resolve(__dirname, "../products/src/index.ts"),
      "@loanscope/config": resolve(__dirname, "../config/src/index.ts"),
    },
  },
});
