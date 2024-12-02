import { defineConfig } from "vite";
import commonjs from "vite-plugin-commonjs";
import inject from "@rollup/plugin-inject";
import { resolve } from "path";

const isDevelopment = process.env.NODE_ENV === "development";

export default defineConfig({
  root: "./bundle",
  appType: "mpa",
  publicDir: "public",
  build: {
    sourcemap: true,
    minify: !isDevelopment,
    outDir: `../dist`,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        profile: resolve(__dirname, "bundle/profile/index.html"),
        food: resolve(__dirname, "bundle/food/index.html"),
        admin: resolve(__dirname, "bundle/admin/index.html"),
        report: resolve(__dirname, "bundle/report/index.html"),
        clock: resolve(__dirname, "bundle/clock/index.html"),
        main: resolve(__dirname, "bundle/index.html"),
      },
    },
    target: "es2015",
    commonjsOptions: {
      transformMixedEsModules: true,
      defaultIsModuleExports: true,
    },
  },
  define: {
    global: "window",
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV ?? "production"
    ),
  },
  assetsInclude: ["**/*.jpg", "**/*.png", "**/*.gif"],
  plugins: [
    commonjs(),
    inject({
      $: "jquery",
      jQuery: "jquery",
    }),
  ],
  resolve: {
    alias: {
      crypto: "crypto-browserify",
      stream: "stream-browserify",
    },
  },
  optimizeDeps: {
    include: ["jquery-ui", "lodash", "d3"],
  },
  server: { hmr: true },

  test: {
    include: ["../tests/**/*.test.{js,ts}"],
    setupFiles: ["../tests/setup/testing-library.js"],
  },
});
