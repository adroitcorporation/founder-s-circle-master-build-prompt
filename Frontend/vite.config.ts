import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({ plugins: [react()], resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } }, build: { outDir: 'dist' }, server: { port: 5173, strictPort: true, proxy: { '/api': 'http://localhost:3001', '/socket.io': { target: 'http://localhost:3001', ws: true } } } });
