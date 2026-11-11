import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import {fileURLToPath} from 'node:url';
export default defineConfig({
 plugins:[vue()],base:'/accounting-app/',
 build:{outDir:fileURLToPath(new URL('../../../frontend/public/accounting-app/',import.meta.url)),emptyOutDir:true},
});
