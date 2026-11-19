// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
  server: { port: 4621 },
  build: { inlineStylesheets: 'always' },
});
