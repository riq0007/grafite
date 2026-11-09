// A sessão dos testes que abrem o app depois da chegada: já valendo, com a conta de exemplo. O
// servidor dela responde o GET /api/conta e os pedidos que o teste preparar; um pedido não
// preparado falha como falta de conexão.
import type { AjustesDasPreferencias, Permissao } from '@grafite/domain';
import {
  type ContaDaSessao,
  criarLojaDaSessao,
  type LojaDaSessao,
  type ServidorDaSessao,
} from '../sessao/loja.ts';
import type { PermissaoDaSessao } from '../sessao/useAcesso.ts';

/** O servidor de um teste: cada pedido, como "GET /api/pessoas", e a resposta dele. */
export type ServidorDeTeste = Record<string, (pedido: Request) => Response | Promise<Response>>;

/** As permissões dadas, valendo para a organização inteira. */
export const naOrganizacao = (...chaves: Permissao[]): PermissaoDaSessao[] =>
  chaves.map((chave) => ({ chave, organizacao: true, locais: [] }));

/** A conta da sessão de exemplo, sem foto e sem preferências mudadas. */
export const CONTA_DE_EXEMPLO: ContaDaSessao = {
  id: '0199a6e0-0000-7000-8000-0000000000c1',
  usuario: 'ana.souza',
  nome: 'Ana Souza',
  pessoaId: '0199a6e0-0000-7000-8000-0000000000a1',
  foto: null,
  preferencias: {},
};

/** O GET /api/conta da conta de exemplo. */
export const DADOS_DA_CONTA_DE_EXEMPLO = {
  usuario: CONTA_DE_EXEMPLO.usuario,
  nome: CONTA_DE_EXEMPLO.nome,
  email: 'ana.souza@exemplo.com.br',
  doisPassos: {
    situacao: 'ativa',
    exigida: true,
    exigidaPor: { conta: true, perfis: [] },
    codigosRestantes: 10,
  },
};

/** O que o servidor diz de si nos testes: a produção, numa organização cliente, tudo ligado. */
const SERVIDOR_DE_EXEMPLO: ServidorDaSessao = {
  ambiente: 'producao',
  operaOServidor: false,
  modulosDesligados: [],
};

/**
 * O GET /api/sessao da conta de exemplo, valendo, com as permissões dadas e o que a organização
 * diz de si, como os módulos desligados: para os testes em que a tela valida a sessão de novo.
 */
export const estadoDaSessaoAtiva = (
  permissoes: PermissaoDaSessao[] = [],
  organizacao: { modulosDesligados?: string[]; preferencias?: AjustesDasPreferencias } = {},
) =>
  Response.json({
    ambiente: SERVIDOR_DE_EXEMPLO.ambiente,
    organizacao: {
      nome: 'Empresa de exemplo',
      preferencias: {},
      operaOServidor: SERVIDOR_DE_EXEMPLO.operaOServidor,
      modulosDesligados: [],
      ...organizacao,
    },
    sessao: {
      conta: CONTA_DE_EXEMPLO,
      pendencia: null,
      csrf: 'csrf-de-teste',
      expiraEm: '2099-01-01T00:00:00.000Z',
      acesso: { permissoes },
    },
  });

/**
 * A sessão valendo, com as permissões dadas; sem elas, a conta não pode nada. As preferências são
 * as que a conta mudou, que valem por cima dos padrões de fábrica, e a conta pode trazer outros
 * dados, como a foto. O que o servidor diz de si, como o ambiente e os módulos desligados, vai por
 * último, por cima do de exemplo.
 */
export function sessaoAtiva(
  permissoes: PermissaoDaSessao[] = [],
  servidor: ServidorDeTeste = {},
  preferencias: AjustesDasPreferencias = {},
  conta: Partial<ContaDaSessao> = {},
  doServidor: Partial<ServidorDaSessao> = {},
): LojaDaSessao {
  return criarLojaDaSessao({
    servidor: { ...SERVIDOR_DE_EXEMPLO, ...doServidor },
    buscar: async (pedido) => {
      const caminho = `${pedido.method} ${new URL(pedido.url).pathname}`;
      const responder = servidor[caminho];
      if (responder) return responder(pedido);
      if (caminho === 'GET /api/conta') return Response.json(DADOS_DA_CONTA_DE_EXEMPLO);
      if (caminho === 'GET /api/notificacoes') {
        return Response.json({ itens: [], naoLidas: 0, proximo: null });
      }
      // Os canais de fora (change p3c-email-e-push): sem a configuração deles, de fábrica.
      if (caminho === 'GET /api/conta/canais') {
        return Response.json({
          email: { situacao: 'sem-configuracao', endereco: null },
          push: { situacao: 'sem-configuracao', chavePublica: null, aparelhos: [] },
        });
      }
      throw new Error(`O teste não preparou o servidor para ${caminho}.`);
    },
    estado: {
      tipo: 'ativa',
      organizacao: 'Empresa de exemplo',
      conta: { ...CONTA_DE_EXEMPLO, preferencias, ...conta },
      csrf: 'csrf-de-teste',
      expiraEm: '2099-01-01T00:00:00.000Z',
      acesso: { permissoes },
    },
  });
}
