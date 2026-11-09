// Sobe o PostgreSQL de teste do packages/db uma vez para os testes de integração da API.
import { iniciarBancoDeTeste } from '@grafite/db/teste';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    urlDono: string;
    urlApp: string;
  }
}

export default async function setup(project: TestProject) {
  const banco = await iniciarBancoDeTeste();
  project.provide('urlDono', banco.urlDono);
  project.provide('urlApp', banco.urlApp);
  return banco.parar;
}
