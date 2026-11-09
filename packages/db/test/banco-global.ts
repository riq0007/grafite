// Sobe o PostgreSQL de teste uma vez para os testes de integração do packages/db.
import type { TestProject } from 'vitest/node';
import { iniciarBancoDeTeste } from './banco-de-teste.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    urlDono: string;
    urlApp: string;
    urlBackup: string;
    urlSuperusuario: string;
  }
}

export default async function setup(project: TestProject) {
  const banco = await iniciarBancoDeTeste();
  project.provide('urlDono', banco.urlDono);
  project.provide('urlApp', banco.urlApp);
  project.provide('urlBackup', banco.urlBackup);
  project.provide('urlSuperusuario', banco.urlSuperusuario);
  return banco.parar;
}
