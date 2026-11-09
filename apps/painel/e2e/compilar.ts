// A página compilada, como o pacote da versão a leva, antes das pontas a ponta.
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

export default async function compilar() {
  await build({ root: fileURLToPath(new URL('..', import.meta.url)), logLevel: 'warn' });
}
