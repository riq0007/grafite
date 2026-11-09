// As dependências da API nos testes unitários: um banco que nunca chega a conectar (o pool só
// conecta na primeira consulta), a chave dos dois passos de teste, o armazenamento na memória e o
// relógio do sistema.
import { criarBanco } from '@grafite/db';
import pg from 'pg';
import type { Dependencias } from '../src/app.ts';
import type { Armazenamento } from '../src/arquivos/armazenamento.ts';
import type { ChavesDoCofre } from '../src/cofre/cifra.ts';

/** 32 bytes de valor 7: a chave dos dois passos dos testes, nunca a de um ambiente. */
export const CHAVE_DOIS_PASSOS_DE_TESTE = Buffer.alloc(32, 7);

/** 32 bytes de valor 9: a chave mestra do cofre dos testes, nunca a de um ambiente. */
export const CHAVES_DO_COFRE_DE_TESTE: ChavesDoCofre = { atual: Buffer.alloc(32, 9) };

/** O armazenamento dos testes unitários, na memória. */
export function armazenamentoEmMemoria(): Armazenamento {
  const conteudos = new Map<string, Buffer>();
  return {
    gravar: async (chave, conteudo) => {
      conteudos.set(chave, conteudo);
    },
    abrir: async (chave) => conteudos.get(chave) ?? null,
    apagar: async (chave) => {
      conteudos.delete(chave);
    },
  };
}

export function dependenciasDeTeste(parciais: Partial<Dependencias> = {}): Dependencias {
  return {
    ambiente: 'desenvolvimento',
    versao: '1.2.3',
    verificarBanco: async () => {},
    banco: criarBanco(new pg.Pool({ connectionString: 'postgres://teste@127.0.0.1:9/nenhum' })),
    chaveDoisPassos: CHAVE_DOIS_PASSOS_DE_TESTE,
    chavesDoCofre: CHAVES_DO_COFRE_DE_TESTE,
    armazenamento: armazenamentoEmMemoria(),
    agora: () => new Date(),
    ...parciais,
  };
}
