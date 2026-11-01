import {defineConfig} from 'vite';
export default defineConfig({
  server: {proxy: {'/api': 'http://127.0.0.1:3001'}},
  // Prebundle PDF dependencies up front so the first download does not reload the dev page.
  optimizeDeps: {include:['pdf-lib','@pdf-lib/fontkit']},
});
