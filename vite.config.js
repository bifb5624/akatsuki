import {defineConfig} from 'vite';
export default defineConfig({
  define: {__APP_VERSION__: JSON.stringify(process.env.RENDER_GIT_COMMIT?.slice(0,12)||process.env.GITHUB_SHA?.slice(0,12)||'development')},
  server: {proxy: {'/api': 'http://127.0.0.1:3001'}},
  // Prebundle PDF dependencies up front so the first download does not reload the dev page.
  optimizeDeps: {include:['pdf-lib','@pdf-lib/fontkit']},
});
