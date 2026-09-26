import { defineConfig } from 'drizzle-kit';
import path from 'path';

export default defineConfig({
  schema: path.resolve(__dirname, 'src/schema/index.ts'),
  out: path.resolve(__dirname, 'drizzle'),
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://aristocolors:aristocolors_secret_2026@localhost:5432/aristocolors_dev',
  },
  verbose: true,
  strict: true,
});
