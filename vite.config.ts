import { defineConfig } from 'vite'
import { prescientApiPlugin } from './plugins/odailyApi'

export default defineConfig({
  plugins: [prescientApiPlugin()],
  server: {
    port: 5180,
    open: true,
  },
})
