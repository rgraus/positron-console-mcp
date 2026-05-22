const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const config = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outdir: "out",
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["vscode"],
  sourcemap: !production,
  minify: production,
  treeShaking: true,
  keepNames: true,
  mainFields: ["module", "main"],
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
    console.log("[esbuild] Watching for changes...");
  } else {
    await esbuild.build(config);
    console.log("[esbuild] Build complete.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});