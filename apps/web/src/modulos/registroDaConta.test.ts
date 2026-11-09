import type { Permissao } from '@grafite/domain';
import { createRoute } from '@tanstack/react-router';
import { Box, Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { raiz } from '../rotas/raiz.tsx';
import { interruptorDe, registroDaConta } from './registroDaConta.ts';
import { definirModulo, type ModuloRegistrado } from './tipos.ts';

const rotasDoLivre = createRoute({ getParentRoute: () => raiz, path: '/livre' });
const livre = definirModulo({
  id: 'livre',
  nome: 'Livre',
  icone: Box,
  endereco: '/livre',
  prioridadeNoCelular: 1,
  rotas: rotasDoLivre,
});

const rotasDaAdministracao = createRoute({ getParentRoute: () => raiz, path: '/administracao' });
const administracao = definirModulo({
  id: 'administracao',
  nome: 'Administração',
  icone: Users,
  endereco: '/administracao',
  prioridadeNoCelular: 2,
  rotas: rotasDaAdministracao,
  permissoes: ['pessoas.ver', 'auditoria.ver'],
  menu: [
    { rotulo: 'Pessoas', destino: '/administracao', permissoes: ['pessoas.ver'] },
    { rotulo: 'Auditoria', destino: '/administracao', permissoes: ['auditoria.ver'] },
    {
      rotulo: 'Acessos',
      filhos: [
        { rotulo: 'Perfis', destino: '/administracao', permissoes: ['acessos.ver'] },
        { rotulo: 'Grupos', destino: '/administracao', permissoes: ['acessos.ver'] },
      ],
    },
    { rotulo: 'Sobre', destino: '/administracao' },
  ],
  menusDaBarra: [
    {
      rotulo: 'Arquivo',
      itens: [{ rotulo: 'Nova pessoa', destino: '/administracao', permissoes: ['pessoas.editar'] }],
    },
    { rotulo: 'Visualizar', itens: [{ rotulo: 'Pessoas', destino: '/administracao' }] },
  ],
  busca: {
    entradas: [
      {
        id: 'nova-pessoa',
        rotulo: 'Nova pessoa',
        grupo: 'acoes',
        destino: '/administracao',
        permissoes: ['pessoas.editar'],
      },
      { id: 'pessoas', rotulo: 'Pessoas', grupo: 'ir-para', destino: '/administracao' },
    ],
    provedores: [
      { grupo: 'Pessoas', buscar: async () => [], permissoes: ['pessoas.ver'] },
      { grupo: 'Registros', buscar: async () => [], permissoes: ['auditoria.ver'] },
    ],
  },
  ocorrencias: { buscar: async () => [], permissoes: ['auditoria.ver'] },
  menuDinamico: { permissoes: ['auditoria.ver'], consultas: () => [], montar: ({ menu }) => menu },
  cadastros: [
    {
      alvo: 'local',
      titulo: 'Novo local',
      link: 'Cadastrar novo local',
      componente: () => null,
      permissoes: ['locais.editar'],
    },
  ],
});

const REGISTRO: readonly ModuloRegistrado[] = [livre, administracao];

const comAs =
  (...chaves: Permissao[]) =>
  (chave: Permissao) =>
    chaves.includes(chave);

const rotulosDe = (itens: readonly { rotulo: string }[] | undefined) =>
  itens?.map((item) => item.rotulo);

describe('registroDaConta', () => {
  it('sem permissão nenhuma, como na sessão desconhecida, fica só o que não exige', () => {
    expect(registroDaConta(REGISTRO, () => false).map((modulo) => modulo.id)).toEqual(['livre']);
  });

  it('o módulo aparece para quem tem ao menos uma das permissões dele, em qualquer escopo', () => {
    const [, visto] = registroDaConta(REGISTRO, comAs('auditoria.ver'));
    expect(visto?.id).toBe('administracao');
  });

  it('os itens de menu sem a permissão somem, e o submenu sem itens some com eles', () => {
    const [, visto] = registroDaConta(REGISTRO, comAs('pessoas.ver'));
    expect(rotulosDe(visto?.menu)).toEqual(['Pessoas', 'Sobre']);
    const comAcessos = registroDaConta(REGISTRO, comAs('pessoas.ver', 'acessos.ver'))[1];
    const acessos = comAcessos?.menu?.find((item) => item.rotulo === 'Acessos');
    expect(acessos && 'filhos' in acessos ? rotulosDe(acessos.filhos) : null).toEqual([
      'Perfis',
      'Grupos',
    ]);
  });

  it('os menus da barra perdem os itens sem a permissão, e o menu vazio some', () => {
    const [, visto] = registroDaConta(REGISTRO, comAs('pessoas.ver'));
    expect(rotulosDe(visto?.menusDaBarra)).toEqual(['Visualizar']);
    // A sessão traz as permissões incluídas: quem edita pessoas também as vê.
    const [, quemEdita] = registroDaConta(REGISTRO, comAs('pessoas.editar', 'pessoas.ver'));
    expect(rotulosDe(quemEdita?.menusDaBarra)).toEqual(['Arquivo', 'Visualizar']);
  });

  it('a entrada de busca, os provedores e a fonte sem a permissão somem', () => {
    const [, visto] = registroDaConta(REGISTRO, comAs('auditoria.ver'));
    expect(visto?.busca?.entradas?.map((entrada) => entrada.id)).toEqual(['pessoas']);
    expect(visto?.busca?.provedores?.map((provedor) => provedor.grupo)).toEqual(['Registros']);
    expect(visto?.ocorrencias).toBe(administracao.ocorrencias);

    const [, outro] = registroDaConta(REGISTRO, comAs('pessoas.ver', 'pessoas.editar'));
    expect(outro?.busca?.entradas?.map((entrada) => entrada.id)).toEqual([
      'nova-pessoa',
      'pessoas',
    ]);
    expect(outro?.busca?.provedores).toEqual([administracao.busca?.provedores?.[0]]);
    expect(outro?.ocorrencias).toBeUndefined();
  });

  it('o menu dos dados fica só para quem tem a permissão dele', () => {
    const [, semAuditoria] = registroDaConta(REGISTRO, comAs('pessoas.ver'));
    expect(semAuditoria?.menuDinamico).toBeUndefined();
    const [, comAuditoria] = registroDaConta(REGISTRO, comAs('auditoria.ver'));
    expect(comAuditoria?.menuDinamico).toBe(administracao.menuDinamico);
  });

  it('o cadastro que abre numa aba fica só para quem tem a permissão dele', () => {
    const [, semEditar] = registroDaConta(REGISTRO, comAs('pessoas.ver'));
    expect(semEditar?.cadastros).toEqual([]);
    const [, comEditar] = registroDaConta(REGISTRO, comAs('pessoas.ver', 'locais.editar'));
    expect(comEditar?.cadastros).toEqual(administracao.cadastros);
  });

  it('o módulo que a organização desligou some inteiro, mesmo para quem tem as permissões', () => {
    const todas = () => true;
    expect(registroDaConta(REGISTRO, todas, ['administracao']).map((modulo) => modulo.id)).toEqual([
      'livre',
    ]);
    expect(registroDaConta(REGISTRO, todas, []).map((modulo) => modulo.id)).toEqual([
      'livre',
      'administracao',
    ]);
  });

  it('Módulo que é parte de outro desligado: some junto com o dono, que é o interruptor dele', () => {
    const rotasDaParte = createRoute({ getParentRoute: () => raiz, path: '/parte' });
    const parte = definirModulo({
      id: 'parte',
      nome: 'Parte da Administração',
      icone: Box,
      endereco: '/parte',
      prioridadeNoCelular: 'mais',
      rotas: rotasDaParte,
      parteDe: 'administracao',
    });
    const comAParte: readonly ModuloRegistrado[] = [livre, administracao, parte];
    const todas = () => true;
    expect(registroDaConta(comAParte, todas, ['administracao']).map((modulo) => modulo.id)).toEqual(
      ['livre'],
    );
    expect(registroDaConta(comAParte, todas, []).map((modulo) => modulo.id)).toEqual([
      'livre',
      'administracao',
      'parte',
    ]);
    expect(interruptorDe(parte)).toBe('administracao');
    expect(interruptorDe(administracao)).toBe('administracao');
  });

  it('não muda o registro de entrada, e o módulo sem permissões passa como está', () => {
    const [vistoLivre] = registroDaConta(REGISTRO, () => false);
    expect(vistoLivre).toBe(livre);
    registroDaConta(REGISTRO, comAs('pessoas.ver'));
    expect(rotulosDe(administracao.menu)).toEqual(['Pessoas', 'Auditoria', 'Acessos', 'Sobre']);
  });
});
