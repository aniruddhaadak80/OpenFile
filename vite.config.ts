import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// VITE_BASE lets the same build run at the domain root (Vercel) or under /OpenFile/ (GitHub Pages)
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@imgly/background-removal', '@huggingface/transformers'] },
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 4000, target: 'es2022' },
})
