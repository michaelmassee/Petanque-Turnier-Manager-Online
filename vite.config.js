import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import tailwindcss from '@tailwindcss/vite';

const devHost = process.env.VITE_DEV_HOST || '192.168.178.46';
const devPort = Number(process.env.VITE_DEV_PORT || 5173);

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.js'],
            refresh: true,
        }),
        tailwindcss(),
    ],
    server: {
        host: '0.0.0.0',
        port: devPort,
        strictPort: true,
        origin: `http://${devHost}:${devPort}`,
        hmr: {
            host: devHost,
            port: devPort,
        },
    },
});
