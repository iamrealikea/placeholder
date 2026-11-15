
import js from "@eslint/js";
import globals from "globals";

export default [
  // ไม่ตรวจไฟล์ที่ไม่ใช่ Source Code
  {
    ignores: [
      "node_modules/**",
      "data/**",
      "uploads/**",
      "screenshot/**",
      ".agents/**",
      "reports/**"
    ]
  },

  // กฎตรวจ JavaScript พื้นฐาน
  js.configs.recommended,

  // Backend และ Test ใช้ Node.js + CommonJS
  {
    files: [
      "src/**/*.js",
      "server.js",
      "tests/**/*.js"
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: globals.node
    }
  },

  // Frontend ใช้ Browser
  {
    files: ["public/js/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: globals.browser
    }
  },

  // ตรวจ Complexity ของโค้ด
  {
    files: [
      "public/js/**/*.js",
      "src/**/*.js",
      "server.js",
      "tests/**/*.js"
    ],
    rules: {
      complexity: ["warn", 10]
    }
  }
];
