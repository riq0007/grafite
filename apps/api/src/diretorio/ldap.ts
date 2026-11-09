// O cliente do diretório pelo ldapts (spec diretorio-ad; change integracao-ad-ldap, design, decisões
// 1 e 4), em JavaScript puro, que roda igual no Linux e no Windows. Cada operação abre a conexão,
// entra com a conta de serviço, faz o pedido e fecha. As falhas viram a FalhaDoDiretorio com o
// motivo em texto; a causa, que pode trazer DNs, não sai daqui.

import { rootCertificates } from 'node:tls';
import {
  comSituacaoNoAd,
  contaAtivaNoAd,
  escaparFiltro,
  filtroDaBuscaDeGrupos,
  filtroDaBuscaDeUsuarios,
  filtroDoUsuario,
} from '@grafite/domain';
import {
  AlreadyExistsError,
  Attribute,
  Change,
  Client,
  ConstraintViolationError,
  type Entry,
  InsufficientAccessError,
  InvalidCredentialsError,
  NoSuchAttributeError,
  NoSuchObjectError,
  ResultCodeError,
  TypeOrValueExistsError,
  UnwillingToPerformError,
} from 'ldapts';
import {
  type AcessoAoDiretorio,
  type ConectarDiretorio,
  FalhaDoDiretorio,
  type GrupoDoDiretorio,
  type UsuarioDoDiretorio,
} from './cliente.ts';

const PRAZO_DA_CONEXAO = 5_000;
const PRAZO_DO_PEDIDO = 10_000;
const PAGINA_DA_CONTAGEM = 500;

/** Os códigos de erro do TLS que dizem que o certificado do servidor não é confiável. */
const DO_CERTIFICADO = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

/** A falha do AD com o motivo; a que já é uma FalhaDoDiretorio segue como está. */
function traduzir(erro: unknown): FalhaDoDiretorio {
  if (erro instanceof FalhaDoDiretorio) return erro;
  if (erro instanceof InsufficientAccessError) return new FalhaDoDiretorio('sem-permissao');
  if (erro instanceof NoSuchObjectError) return new FalhaDoDiretorio('nao-encontrado');
  if (erro instanceof ResultCodeError) return new FalhaDoDiretorio('recusado');
  const codigo = (erro as { code?: unknown } | null)?.code;
  if (typeof codigo === 'string' && DO_CERTIFICADO.has(codigo)) {
    return new FalhaDoDiretorio('certificado');
  }
  return new FalhaDoDiretorio('nao-respondeu');
}

/** Os valores de um atributo, achado sem diferenciar maiúsculas, como lista de textos. */
function valores(entrada: Entry, atributo: string): string[] {
  const chave = Object.keys(entrada).find((nome) => nome.toLowerCase() === atributo.toLowerCase());
  if (!chave) return [];
  const valor = entrada[chave];
  const lista = Array.isArray(valor) ? valor : [valor];
  return lista.map((item) => (Buffer.isBuffer(item) ? item.toString('utf8') : String(item)));
}

const um = (entrada: Entry, atributo: string) => valores(entrada, atributo)[0] ?? null;

const ATRIBUTOS_DO_USUARIO = ['displayName', 'cn', 'mail', 'userAccountControl', 'memberOf'];

function usuarioDa(entrada: Entry, atributoDoUsuario: string): UsuarioDoDiretorio {
  const usuario = um(entrada, atributoDoUsuario) ?? '';
  const controle = Number(um(entrada, 'userAccountControl'));
  return {
    dn: entrada.dn,
    usuario,
    nome: um(entrada, 'displayName') ?? um(entrada, 'cn') ?? usuario,
    email: um(entrada, 'mail'),
    ativa: contaAtivaNoAd(Number.isFinite(controle) && controle > 0 ? controle : null),
    grupos: valores(entrada, 'memberOf'),
  };
}

function grupoDa(entrada: Entry): GrupoDoDiretorio {
  return {
    dn: entrada.dn,
    nome: um(entrada, 'cn') ?? entrada.dn,
    membros: valores(entrada, 'member').length,
  };
}

/**
 * As opções do TLS (change guia-do-diretorio, design, decisão 2): com a AC da empresa, o Node confia
 * nela além das públicas, que o `ca` substituiria sozinho; sem ela, só nas públicas, como antes.
 */
export function opcoesDoTls(
  acesso: Pick<AcessoAoDiretorio, 'conferirCertificado' | 'acDoServidor'>,
): {
  rejectUnauthorized: boolean;
  ca?: string[];
} {
  if (!acesso.acDoServidor) return { rejectUnauthorized: acesso.conferirCertificado };
  return {
    rejectUnauthorized: acesso.conferirCertificado,
    ca: [...rootCertificates, acesso.acDoServidor],
  };
}

export const conectarPeloLdap: ConectarDiretorio = (acesso: AcessoAoDiretorio) => {
  const abrir = () =>
    new Client({
      url: acesso.servidor,
      connectTimeout: PRAZO_DA_CONEXAO,
      timeout: PRAZO_DO_PEDIDO,
      tlsOptions: opcoesDoTls(acesso),
      strictDN: false,
    });
  const atributos = [acesso.atributoDoUsuario, ...ATRIBUTOS_DO_USUARIO];

  /** Uma operação com a conta de serviço: conecta, entra, faz e fecha a conexão. */
  async function comServico<T>(fazer: (cliente: Client) => Promise<T>): Promise<T> {
    const cliente = abrir();
    try {
      try {
        await cliente.bind(acesso.conta.usuario, acesso.conta.senha);
      } catch (erro) {
        throw erro instanceof InvalidCredentialsError
          ? new FalhaDoDiretorio('conta-recusada')
          : traduzir(erro);
      }
      return await fazer(cliente);
    } catch (erro) {
      throw traduzir(erro);
    } finally {
      await cliente.unbind().catch(() => undefined);
    }
  }

  const buscar = (cliente: Client, filtro: string, limite: number, base = acesso.baseDn) =>
    cliente.search(base, {
      scope: 'sub',
      filter: filtro,
      attributes: atributos,
      sizeLimit: limite,
    });

  /** Muda o AD; a mudança que já estava feita, como incluir quem já é membro, não falha. */
  async function mudar(dn: string, mudanca: Change, jaFeita: (erro: unknown) => boolean) {
    await comServico(async (cliente) => {
      try {
        await cliente.modify(dn, mudanca);
      } catch (erro) {
        if (!jaFeita(erro)) throw erro;
      }
    });
  }

  const doMembro = (operation: 'add' | 'delete', usuarioDn: string) =>
    new Change({ operation, modification: new Attribute({ type: 'member', values: [usuarioDn] }) });

  return {
    contarUsuarios: (limite) =>
      comServico(async (cliente) => {
        let quantos = 0;
        for await (const pagina of cliente.searchPaginated(acesso.baseDn, {
          scope: 'sub',
          filter: acesso.filtroDasPessoas,
          attributes: ['cn'],
          paged: { pageSize: PAGINA_DA_CONTAGEM },
        })) {
          quantos += pagina.searchEntries.length;
          if (quantos > limite) break;
        }
        return quantos;
      }),

    async autenticar(usuario, senha) {
      // O AD aceita a senha vazia como entrada anônima: ela nunca chega ao bind.
      if (senha === '') return null;
      const pessoa = await comServico(async (cliente) => {
        const { searchEntries } = await buscar(cliente, filtroDoUsuario(acesso, usuario), 2);
        const [unica] = searchEntries;
        return searchEntries.length === 1 && unica
          ? usuarioDa(unica, acesso.atributoDoUsuario)
          : null;
      });
      if (!pessoa) return null;
      const cliente = abrir();
      try {
        await cliente.bind(pessoa.dn, senha);
        return pessoa;
      } catch (erro) {
        if (erro instanceof InvalidCredentialsError) return null;
        throw traduzir(erro);
      } finally {
        await cliente.unbind().catch(() => undefined);
      }
    },

    buscarUsuarios: (termo, limite) =>
      comServico(async (cliente) => {
        const { searchEntries } = await buscar(
          cliente,
          filtroDaBuscaDeUsuarios(acesso, termo),
          limite,
        );
        return searchEntries.map((entrada) => usuarioDa(entrada, acesso.atributoDoUsuario));
      }),

    usuario: (dn) =>
      comServico(async (cliente) => {
        try {
          const { searchEntries } = await cliente.search(dn, {
            scope: 'base',
            filter: '(objectClass=*)',
            attributes: atributos,
          });
          const [entrada] = searchEntries;
          return entrada ? usuarioDa(entrada, acesso.atributoDoUsuario) : null;
        } catch (erro) {
          if (erro instanceof NoSuchObjectError) return null;
          throw erro;
        }
      }),

    buscarGrupos: (termo, limite) =>
      comServico(async (cliente) => {
        const { searchEntries } = await cliente.search(acesso.baseDn, {
          scope: 'sub',
          filter: filtroDaBuscaDeGrupos(termo),
          attributes: ['cn', 'member'],
          sizeLimit: limite,
        });
        return searchEntries.map(grupoDa);
      }),

    grupo: (dn) =>
      comServico(async (cliente) => {
        try {
          const { searchEntries } = await cliente.search(dn, {
            scope: 'base',
            filter: '(objectClass=group)',
            attributes: ['cn', 'member'],
          });
          const [entrada] = searchEntries;
          return entrada ? grupoDa(entrada) : null;
        } catch (erro) {
          if (erro instanceof NoSuchObjectError) return null;
          throw erro;
        }
      }),

    membros: (grupoDn, limite) =>
      comServico(async (cliente) => {
        const filtro = `(&${acesso.filtroDasPessoas}(memberOf=${escaparFiltro(grupoDn)}))`;
        const { searchEntries } = await buscar(cliente, filtro, limite);
        return searchEntries.map((entrada) => usuarioDa(entrada, acesso.atributoDoUsuario));
      }),

    incluirNoGrupo: (usuarioDn, grupoDn) =>
      mudar(
        grupoDn,
        doMembro('add', usuarioDn),
        (erro) => erro instanceof TypeOrValueExistsError || erro instanceof AlreadyExistsError,
      ),

    tirarDoGrupo: (usuarioDn, grupoDn) =>
      mudar(grupoDn, doMembro('delete', usuarioDn), (erro) => erro instanceof NoSuchAttributeError),

    mudarSituacao: (usuarioDn, ativa) =>
      comServico(async (cliente) => {
        const { searchEntries } = await cliente.search(usuarioDn, {
          scope: 'base',
          filter: '(objectClass=*)',
          attributes: ['userAccountControl'],
        });
        const [entrada] = searchEntries;
        if (!entrada) throw new FalhaDoDiretorio('nao-encontrado');
        const atual = Number(um(entrada, 'userAccountControl') ?? '512');
        await cliente.modify(
          usuarioDn,
          new Change({
            operation: 'replace',
            modification: new Attribute({
              type: 'userAccountControl',
              values: [String(comSituacaoNoAd(atual, ativa))],
            }),
          }),
        );
      }),

    redefinirSenha: (usuarioDn, senha) =>
      comServico(async (cliente) => {
        try {
          await cliente.modify(
            usuarioDn,
            new Change({
              operation: 'replace',
              modification: new Attribute({
                type: 'unicodePwd',
                values: [Buffer.from(`"${senha}"`, 'utf16le')],
              }),
            }),
          );
        } catch (erro) {
          // O AD recusa a senha fora da política com uma dessas duas.
          if (erro instanceof ConstraintViolationError || erro instanceof UnwillingToPerformError) {
            throw new FalhaDoDiretorio('politica-da-senha');
          }
          throw erro;
        }
      }),
  };
};
