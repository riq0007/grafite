// O adaptador do ldapts (change integracao-ad-ldap, design, decisões 1 e 4), com o ldapts simulado:
// a busca da pessoa com a conta de serviço e a senha conferida no AD; as falhas em texto; a
// situação pelo userAccountControl; a senha no unicodePwd; e as mudanças que já estavam feitas.

import { rootCertificates } from 'node:tls';
import {
  InsufficientAccessError,
  InvalidCredentialsError,
  NoSuchAttributeError,
  TypeOrValueExistsError,
} from 'ldapts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FalhaDoDiretorio } from './cliente.ts';

interface Chamada {
  metodo: string;
  argumentos: unknown[];
}

const { estado } = vi.hoisted(() => ({
  estado: {
    chamadas: [] as Chamada[],
    /** O que cada bind faz, pelo DN: nada, ou o erro que lança. */
    binds: new Map<string, Error>(),
    entradas: [] as Record<string, unknown>[],
    paginas: [] as Record<string, unknown>[][],
    erroDoModify: null as Error | null,
    erroDaConexao: null as Error | null,
  },
}));

vi.mock('ldapts', async (original) => {
  const real = await original<typeof import('ldapts')>();
  class Client {
    constructor(opcoes: unknown) {
      estado.chamadas.push({ metodo: 'new', argumentos: [opcoes] });
    }
    async bind(dn: string, senha: string) {
      estado.chamadas.push({ metodo: 'bind', argumentos: [dn, senha] });
      if (estado.erroDaConexao) throw estado.erroDaConexao;
      const erro = estado.binds.get(dn);
      if (erro) throw erro;
    }
    async search(base: string, opcoes: unknown) {
      estado.chamadas.push({ metodo: 'search', argumentos: [base, opcoes] });
      return { searchEntries: estado.entradas, searchReferences: [] };
    }
    async *searchPaginated(base: string, opcoes: unknown) {
      estado.chamadas.push({ metodo: 'searchPaginated', argumentos: [base, opcoes] });
      for (const pagina of estado.paginas) yield { searchEntries: pagina, searchReferences: [] };
    }
    async modify(dn: string, mudancas: unknown) {
      estado.chamadas.push({ metodo: 'modify', argumentos: [dn, mudancas] });
      if (estado.erroDoModify) throw estado.erroDoModify;
    }
    async unbind() {
      estado.chamadas.push({ metodo: 'unbind', argumentos: [] });
    }
  }
  return { ...real, Client };
});

const { conectarPeloLdap } = await import('./ldap.ts');

const ACESSO = {
  servidor: 'ldaps://dc01.empresa.local',
  baseDn: 'DC=empresa,DC=local',
  atributoDoUsuario: 'sAMAccountName',
  filtroDasPessoas: '(&(objectCategory=person)(objectClass=user))',
  conferirCertificado: true,
  conta: { usuario: 'svc_grafite@empresa.local', senha: 'senha-do-servico' },
};

const MARIANA = {
  dn: 'CN=Mariana Alves,OU=TI,DC=empresa,DC=local',
  sAMAccountName: 'mariana.alves',
  displayName: 'Mariana Alves',
  mail: 'mariana@empresa.com',
  userAccountControl: '512',
  memberOf: 'CN=TI-Suporte,OU=Grupos,DC=empresa,DC=local',
};

beforeEach(() => {
  estado.chamadas = [];
  estado.binds = new Map();
  estado.entradas = [];
  estado.paginas = [];
  estado.erroDoModify = null;
  estado.erroDaConexao = null;
});

const chamadas = (metodo: string) =>
  estado.chamadas.filter((chamada) => chamada.metodo === metodo).map((c) => c.argumentos);

describe('a entrada pelo AD', () => {
  it('busca a pessoa com a conta de serviço e confere a senha entrando com o DN dela', async () => {
    estado.entradas = [MARIANA];
    const usuario = await conectarPeloLdap(ACESSO).autenticar('mariana.alves', 'senha-certa');
    expect(usuario).toEqual({
      dn: MARIANA.dn,
      usuario: 'mariana.alves',
      nome: 'Mariana Alves',
      email: 'mariana@empresa.com',
      ativa: true,
      grupos: ['CN=TI-Suporte,OU=Grupos,DC=empresa,DC=local'],
    });
    expect(chamadas('bind')).toEqual([
      ['svc_grafite@empresa.local', 'senha-do-servico'],
      [MARIANA.dn, 'senha-certa'],
    ]);
    expect(chamadas('search')[0]).toEqual([
      'DC=empresa,DC=local',
      expect.objectContaining({
        scope: 'sub',
        filter: '(&(&(objectCategory=person)(objectClass=user))(sAMAccountName=mariana.alves))',
      }),
    ]);
    expect(chamadas('new')[0]?.[0]).toMatchObject({
      url: 'ldaps://dc01.empresa.local',
      tlsOptions: { rejectUnauthorized: true },
    });
    // Cada conexão é fechada.
    expect(chamadas('unbind')).toHaveLength(2);
  });

  it('a senha errada, a vazia e o usuário que não existe dão null', async () => {
    estado.entradas = [MARIANA];
    estado.binds.set(MARIANA.dn, new InvalidCredentialsError('49'));
    const cliente = conectarPeloLdap(ACESSO);
    expect(await cliente.autenticar('mariana.alves', 'errada')).toBeNull();
    estado.chamadas = [];
    expect(await cliente.autenticar('mariana.alves', '')).toBeNull();
    expect(chamadas('bind')).toEqual([]);
    estado.entradas = [];
    expect(await cliente.autenticar('ninguem', 'qualquer')).toBeNull();
  });

  it('a conta de serviço recusada, o servidor fora e o certificado viram a falha com o motivo', async () => {
    estado.binds.set('svc_grafite@empresa.local', new InvalidCredentialsError('49'));
    await expect(conectarPeloLdap(ACESSO).contarUsuarios(1000)).rejects.toThrow(
      new FalhaDoDiretorio('conta-recusada'),
    );
    estado.binds.clear();
    estado.erroDaConexao = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    await expect(conectarPeloLdap(ACESSO).contarUsuarios(1000)).rejects.toThrow(
      new FalhaDoDiretorio('nao-respondeu'),
    );
    estado.erroDaConexao = Object.assign(new Error('self-signed certificate'), {
      code: 'DEPTH_ZERO_SELF_SIGNED_CERT',
    });
    await expect(conectarPeloLdap(ACESSO).contarUsuarios(1000)).rejects.toThrow(
      new FalhaDoDiretorio('certificado'),
    );
  });
});

describe('o teste e as buscas', () => {
  it('conta os usuários pelas páginas e para depois do limite', async () => {
    const pessoa = { dn: 'CN=X' };
    estado.paginas = [Array(600).fill(pessoa), Array(600).fill(pessoa), Array(600).fill(pessoa)];
    expect(await conectarPeloLdap(ACESSO).contarUsuarios(1000)).toBe(1200);
    estado.paginas = [Array(238).fill(pessoa)];
    expect(await conectarPeloLdap(ACESSO).contarUsuarios(1000)).toBe(238);
  });

  it('busca os usuários com o termo escapado e o limite, e os grupos com o número de membros', async () => {
    estado.entradas = [MARIANA];
    const usuarios = await conectarPeloLdap(ACESSO).buscarUsuarios('mari*', 50);
    expect(usuarios.map((usuario) => usuario.usuario)).toEqual(['mariana.alves']);
    expect(chamadas('search')[0]?.[1]).toMatchObject({
      filter:
        '(&(&(objectCategory=person)(objectClass=user))(|(sAMAccountName=*mari\\2a*)(displayName=*mari\\2a*)(mail=*mari\\2a*)))',
      sizeLimit: 50,
    });
    estado.chamadas = [];
    estado.entradas = [
      {
        dn: 'CN=TI-Suporte,OU=Grupos,DC=empresa,DC=local',
        cn: 'TI-Suporte',
        member: ['CN=A', 'CN=B'],
      },
    ];
    expect(await conectarPeloLdap(ACESSO).buscarGrupos('TI', 50)).toEqual([
      { dn: 'CN=TI-Suporte,OU=Grupos,DC=empresa,DC=local', nome: 'TI-Suporte', membros: 2 },
    ]);
  });
});

describe('as mudanças no AD', () => {
  it('desativa trocando só o bit 2 do userAccountControl lido', async () => {
    estado.entradas = [{ dn: MARIANA.dn, userAccountControl: '66048' }];
    await conectarPeloLdap(ACESSO).mudarSituacao(MARIANA.dn, false);
    const [dn, mudanca] = chamadas('modify')[0] ?? [];
    expect(dn).toBe(MARIANA.dn);
    expect(mudanca).toMatchObject({
      operation: 'replace',
      modification: { type: 'userAccountControl', values: ['66050'] },
    });
  });

  it('a senha vai no unicodePwd, entre aspas e em UTF-16LE', async () => {
    await conectarPeloLdap(ACESSO).redefinirSenha(MARIANA.dn, 'Nova@2026');
    const [, mudanca] = chamadas('modify')[0] ?? [];
    const valores = (mudanca as { modification: { values: Buffer[] } }).modification.values;
    expect((mudanca as { operation: string }).operation).toBe('replace');
    expect(valores[0]?.equals(Buffer.from('"Nova@2026"', 'utf16le'))).toBe(true);
  });

  it('incluir quem já é membro e tirar quem já saiu não falham; a falta de permissão falha com o motivo', async () => {
    const cliente = conectarPeloLdap(ACESSO);
    estado.erroDoModify = new TypeOrValueExistsError('20');
    await cliente.incluirNoGrupo(MARIANA.dn, 'CN=TI-Suporte');
    expect(chamadas('modify')[0]?.[1]).toMatchObject({
      operation: 'add',
      modification: { type: 'member', values: [MARIANA.dn] },
    });
    estado.erroDoModify = new NoSuchAttributeError('16');
    await cliente.tirarDoGrupo(MARIANA.dn, 'CN=TI-Suporte');
    estado.erroDoModify = new InsufficientAccessError('50');
    await expect(cliente.incluirNoGrupo(MARIANA.dn, 'CN=TI-Suporte')).rejects.toThrow(
      new FalhaDoDiretorio('sem-permissao'),
    );
  });
});

// O certificado da AC da empresa (change guia-do-diretorio, design, decisão 2): o cliente soma a AC às
// públicas no TLS; sem ela, o TLS fica como antes, só com as públicas do Node.
describe('a AC do servidor no TLS', () => {
  const AC = [
    '-----BEGIN CERTIFICATE-----',
    'MIIBkTCCATegAwIBAgIUQUNEQUVNUFJFU0EwCgYIKoZIzj0EAwIwEjEQ',
    '-----END CERTIFICATE-----',
    '',
  ].join('\n');
  const opcoesDoCliente = () => {
    const [opcoes] = chamadas('new')[0] ?? [];
    return (opcoes as { tlsOptions: { rejectUnauthorized: boolean; ca?: string[] } }).tlsOptions;
  };

  it('Certificado emitido pela AC da empresa: o cliente soma a AC às públicas', async () => {
    estado.paginas = [[]];
    await conectarPeloLdap({ ...ACESSO, acDoServidor: AC }).contarUsuarios(1000);
    const tls = opcoesDoCliente();
    expect(tls.rejectUnauthorized).toBe(true);
    expect(tls.ca?.at(-1)).toBe(AC);
    expect(tls.ca?.slice(0, -1)).toEqual([...rootCertificates]);
  });

  it('sem a AC, só as públicas do Node, e a conferência desligada segue desligada', async () => {
    estado.paginas = [[]];
    await conectarPeloLdap({ ...ACESSO, conferirCertificado: false }).contarUsuarios(1000);
    expect(opcoesDoCliente()).toEqual({ rejectUnauthorized: false });
  });
});
