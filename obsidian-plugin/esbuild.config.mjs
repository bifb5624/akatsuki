import esbuild from 'esbuild';
import builtins from 'builtin-modules';

await esbuild.build({
  entryPoints: ['main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', ...builtins],
  format: 'cjs',
  target: 'es2022',
  outfile: 'main.js',
  sourcemap: false,
  minify: false,
  logLevel: 'info',
});
