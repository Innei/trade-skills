import { fileURLToPath } from 'node:url';

export default {
  resolve: {
    alias: {
      '@server': fileURLToPath(new URL('./src', import.meta.url)),
      '@pro': fileURLToPath(new URL('../pro/src', import.meta.url)),
    },
  },
};
