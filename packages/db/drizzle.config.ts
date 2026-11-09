import { defineConfig } from 'drizzle-kit';

// Só a geração de migrations usa este arquivo; quem aplica é src/migrar.ts.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
});
