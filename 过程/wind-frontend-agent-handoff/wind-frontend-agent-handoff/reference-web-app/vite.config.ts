import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_TARGET || 'http://127.0.0.1:8101';

  return {
    base: './',
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/wind-v2': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
          rewrite: (path) => path.replace(/^\/wind-v2/, ''),
        },
      },
    },
    build: {
      target: 'es2022',
      rollupOptions: {
        output: {
          // three r174 ships core and the WebGL renderer as separate modules;
          // splitting along that boundary keeps every chunk under the default
          // 500 kB warning limit. The 3D view and the data workbench are lazy.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/three/build/three.core')) return 'three-core';
            if (id.includes('/three/build/')) return 'three-renderer';
            if (id.includes('/three/examples/jsm/loaders/')) return 'three-loaders';
            if (id.includes('/three/examples/')) return 'three-addons';
            if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'react';
            return undefined;
          },
        },
      },
    },
  };
});
