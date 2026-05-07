import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(() => {
  const base = process.env.GITHUB_PAGES_BASE ?? '/'
  return {
    base,
    plugins: [
      vue(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'pwa.svg', 'pwa-maskable.svg'],
        manifest: {
          name: 'Ping — Table Tennis Tournaments',
          short_name: 'Ping',
          description: 'Plan and run table-tennis tournaments. Works offline.',
          theme_color: '#0090a7',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '.',
          scope: '.',
          icons: [
            { src: 'pwa.svg', sizes: 'any', type: 'image/svg+xml' },
            { src: 'pwa-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
