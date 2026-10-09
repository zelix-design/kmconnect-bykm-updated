import js from "@eslint/js";
import react from "eslint-plugin-react";

export default [
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react },
    rules: {
      "no-unused-vars": "warn",
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
    },
  },
];
