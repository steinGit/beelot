import globals from "globals";
import pluginJs from "@eslint/js";


/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
        Chart: "readonly",
        L: "readonly"
      }
    }
  },
  {
    files: ["tests/**/*.{js,mjs,cjs,jsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.jest,
        global: "readonly",
        Chart: "readonly",
        L: "readonly"
      }
    }
  },
  pluginJs.configs.recommended,
];
