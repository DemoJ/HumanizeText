import * as esbuild from 'esbuild';
import { mkdir } from 'node:fs/promises';

const watch = process.argv.includes('--watch');

await mkdir('dist', { recursive: true });

const options = {
  entryPoints: ['src/background/index.js'],
  bundle: true,
  outfile: 'background.js',
  format: 'iife',
  platform: 'browser',
  target: ['chrome111', 'firefox109'],
  sourcemap: false,
  minify: false,
  logLevel: 'info',
  // Service Worker 中使用 OpenAI SDK
  define: {
    'process.env.NODE_ENV': '"production"'
  },
  banner: {
    js: '/* HumanizeText background - built with esbuild + openai */\nif (typeof globalThis.process === "undefined") { globalThis.process = { env: {}, version: "", platform: "browser", arch: "unknown" }; }'
  }
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('watching background bundle...');
} else {
  await esbuild.build(options);
  console.log('built background.js');
}
