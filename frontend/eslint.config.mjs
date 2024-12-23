import pluginsecurity from "eslint-plugin-security";

/** @type {ESLint.ConfigData} */
export default [
  pluginsecurity.configs.recommended,
  {
    languageOptions: {
      globals: {
        browser: true,
        commonjs: true,
        es6: true,
        node: true,
        mocha: true,
        jquery: true,
      },
    },
    rules: {
      "security/detect-object-injection": 0,
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_|should|expect",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["lib/client/*.js"],
    rules: {
      "security/detect-object-injection": 0,
    },
  },
];
