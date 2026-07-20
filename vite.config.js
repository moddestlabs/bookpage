import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'assets',
  server: {
    // Fix HMR WebSocket behind GitHub Codespaces / forwarded-port proxies.
    // The browser connects to the proxy on port 443 (HTTPS), not the Vite port.
    hmr: {
      clientPort: 443,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  assetsInclude: ['**/*.glsl'],
});
