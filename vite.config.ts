import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Masterpiece — HD Painting Wallpapers',
        short_name: 'Masterpiece',
        description: 'HD wallpapers that are always famous paintings. Monet, Van Gogh, da Vinci & more. Free, public domain, 4K.',
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0a0b',
        theme_color: '#0a0a0b',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // Painting files are immutable at a given width, so CacheFirst is safe for images;
        // the Met's JSON can change, so it stays NetworkFirst.
        runtimeCaching: [
          { urlPattern: /^https:\/\/upload\.wikimedia\.org\/.*/i, handler: 'CacheFirst', options: { cacheName: 'wikimedia-images', expiration: { maxEntries: 100, maxAgeSeconds: 60*60*24*30 }, cacheableResponse: { statuses: [0,200] } } },
          { urlPattern: /^https:\/\/www\.artic\.edu\/iiif\/.*/i, handler: 'CacheFirst', options: { cacheName: 'artic-iiif', expiration: { maxEntries: 50, maxAgeSeconds: 60*60*24*7 } } },
          { urlPattern: /^https:\/\/collectionapi\.metmuseum\.org\/.*/i, handler: 'NetworkFirst', options: { cacheName: 'met-api', expiration: { maxEntries: 50, maxAgeSeconds: 60*60*24 } } }
        ]
      }
    })
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts']
  }
})
