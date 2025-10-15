module.exports = {
  // Set as the root config file
  root: true,

  // Define the environment for Node.js
  env: {
    es6: true,
    node: true,
  },

  // Extend official Google configuration
  // This automatically provides rules that recognize Node globals like 'module' and 'require'
  extends: [
    "eslint:recommended",
    "google", // Use the official configuration you installed
  ],

  parserOptions: {
    // Specify the JavaScript version
    ecmaVersion: 2020,
  },

  // --- Rules Customization ---
  rules: {
    // 1. Allow 'console.log' for logging purposes in Cloud Functions
    "no-console": "off",

    // 2. Allow single quotes for consistency
    quotes: ["error", "single"],

    // 3. Allow unused variables for simplicity in function signatures (e.g., 'context')
    // We turn off the standard rule and rely on the Node environment to handle globals
    "no-unused-vars": "off",
  },
};
