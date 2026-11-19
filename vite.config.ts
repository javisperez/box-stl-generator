import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import pagesAnalytics from 'pages-analytics/vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.BASE_URL || '/',
  // Injects the analytics snippet at build time only when ANALYTICS_ID is set.
  // consent: GA collects nothing until the consent banner grants it.
  plugins: [tailwindcss(), react(), pagesAnalytics({ consent: true })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
