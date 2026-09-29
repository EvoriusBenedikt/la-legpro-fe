import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev mode is a documented run mode on :5173 (see README "Two run modes"):
    // fail loudly if the port is taken instead of silently drifting to 5174.
    port: 5173,
    strictPort: true,
    allowedHosts: true
  }
})