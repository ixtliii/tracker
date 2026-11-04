import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' makes the build work at https://<you>.github.io/<repo>/
export default defineConfig({ plugins: [react()], base: './' });
