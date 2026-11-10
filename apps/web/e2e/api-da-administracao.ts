// A API da Administração simulada na página, em memória (design do F2b, decisão 17): uma
// organização pequena, com locais, pessoas e as fotos delas, contas, perfis, atribuições, a
// auditoria e as tarefas com falha. As escritas mudam o estado, e a leitura seguinte o devolve,
// como a API de verdade. O que a fixture responde (DA_FIXTURE), como o /api/sessao, os eventos e as
// miniaturas das fotos, passa a ela, e um pedido que esta API não conhece falha com o caminho no
// texto, à vista na tela.
import { randomUUID } from 'node:crypto';
import type { components } from '@grafite/api-client';
import {
  definicaoDa,
  fechamento,
  montarArvore,
  normalizarTexto,
  PERMISSOES,
  type Permissao,
} from '@grafite/domain';
import type { Page } from '@playwright/test';
import { DA_FIXTURE } from './fixtures.ts';

type Esquemas = components['schemas'];
type Local = Esquemas['Local'];
type Ficha = Esquemas['FichaDaPessoa'];
type Conta = Esquemas['ContaDaFicha'];
type Perfil = Esquemas['Perfil'];
type Registro = Esquemas['RegistroDeAuditoria'];
type PermissaoEfetiva = Esquemas['PermissaoEfetiva'];
type TarefaComFalha = Esquemas['TarefaComFalha'];

const id = (numero: number) => `00000000-0000-4000-8000-${String(numero).padStart(12, '0')}`;

/** Os ids dos registros que a organização já tem. */
export const IDS = {
  jundiai: id(1),
  expedicao: id(2),
  administrativo: id(3),
  campinas: id(4),
  ana: id(11),
  contaDaAna: id(12),
  carla: id(13),
  contaDaCarla: id(14),
  daniel: id(15),
  administrador: id(21),
  consultaDePessoas: id(22),
  manutencaoDeOntem: id(41),
  manutencaoDeAnteontem: id(42),
};

/** A senha temporária que a API simulada dá a toda conta criada, no formato da API. */
export const SENHA_TEMPORARIA = 'K7QD-M2XT-9PRW-4HZB';

interface PessoaGuardada {
  id: string;
  nome: string;
  email: string | null;
  matricula: string | null;
  telefone: string | null;
  situacao: Ficha['situacao'];
  localId: string | null;
  foto: { id: string } | null;
}

interface ContaGuardada {
  id: string;
  pessoaId: string;
  usuario: string;
  exigeDoisPassos: boolean;
  doisPassos: Conta['doisPassos'];
  senhaTemporaria: boolean;
}

interface AtribuicaoGuardada {
  id: string;
  perfilId: string;
  contaId: string;
  localId: string | null;
  criadaEm: string;
}

/** Um pedido que chegou à API simulada, com o corpo das escritas. */
export interface PedidoFeito {
  metodo: string;
  caminho: string;
  busca: URLSearchParams;
  corpo: unknown;
}

const local = (id: string, paiId: string | null, nome: string, tipo: Local['tipo']): Local => ({
  id,
  paiId,
  nome,
  tipo,
  situacao: 'ativo',
  permite: { editar: true },
});

const pessoa = (
  id: string,
  nome: string,
  matricula: string,
  localId: string,
  email: string | null = null,
): PessoaGuardada => ({
  id,
  nome,
  email,
  matricula,
  telefone: null,
  situacao: 'ativa',
  localId,
  foto: null,
});

/** A manutenção diária que falhou em todas as tentativas, no dia dado. */
const manutencaoQueFalhou = (id: string, falhouEm: string): TarefaComFalha => ({
  id,
  tarefa: 'manutencao',
  nome: 'Manutenção diária',
  tentativas: 6,
  erro: 'connect ECONNREFUSED 10.0.0.9:5432',
  falhouEm,
});

const PERMITE_NO_PERFIL = {
  editar: true,
  inativar: true,
  reativar: false,
  atribuir: true,
  mudarPrazo: true,
};

/** Um registro da auditoria feito por Ana Souza. */
const registro = (
  numero: number,
  momento: string,
  acao: string,
  rotulo: string,
  alvo: Registro['alvo'],
  codigoDeRastreio: string,
): Registro => ({
  id: id(100 + numero),
  momento,
  acao,
  rotulo,
  ator: { tipo: 'conta', id: IDS.contaDaAna, nome: 'Ana Souza', usuario: 'ana.souza' },
  alvo,
  antes: null,
  depois: null,
  dados: null,
  ip: '10.0.0.15',
  codigoDeRastreio,
});

function estadoInicial() {
  const locais: Local[] = [
    local(IDS.jundiai, null, 'Jundiaí', 'unidade'),
    local(IDS.expedicao, IDS.jundiai, 'Expedição', 'setor'),
    local(IDS.administrativo, IDS.jundiai, 'Administrativo', 'predio'),
    local(IDS.campinas, null, 'Campinas', 'unidade'),
  ];
  const pessoas: PessoaGuardada[] = [
    pessoa(IDS.ana, 'Ana Souza', '000101', IDS.administrativo, 'ana.souza@empresa.com.br'),
    pessoa(IDS.carla, 'Carla Dias', '004513', IDS.expedicao, 'carla.dias@empresa.com.br'),
    pessoa(IDS.daniel, 'Daniel Rocha', '004514', IDS.expedicao),
  ];
  const contas: ContaGuardada[] = [
    {
      id: IDS.contaDaAna,
      pessoaId: IDS.ana,
      usuario: 'ana.souza',
      exigeDoisPassos: true,
      doisPassos: 'ativa',
      senhaTemporaria: false,
    },
    {
      id: IDS.contaDaCarla,
      pessoaId: IDS.carla,
      usuario: 'carla.dias',
      exigeDoisPassos: false,
      doisPassos: 'desativada',
      senhaTemporaria: false,
    },
  ];
  const perfis: Perfil[] = [
    {
      id: IDS.administrador,
      nome: 'Administrador',
      descricao: 'Todas as permissões, na organização inteira.',
      permissoes: [],
      todasAsPermissoes: true,
      protegido: true,
      exigeDoisPassos: true,
      diasDeConfianca: null,
      situacao: 'ativo',
      atribuicoes: 1,
      permite: { ...PERMITE_NO_PERFIL, editar: false, inativar: false },
    },
    {
      id: IDS.consultaDePessoas,
      nome: 'Consulta de pessoas',
      descricao: 'Vê as pessoas e as contas.',
      permissoes: ['pessoas.ver'],
      todasAsPermissoes: false,
      protegido: false,
      exigeDoisPassos: false,
      diasDeConfianca: null,
      situacao: 'ativo',
      atribuicoes: 0,
      permite: PERMITE_NO_PERFIL,
    },
  ];
  const atribuicoes: AtribuicaoGuardada[] = [
    {
      id: id(31),
      perfilId: IDS.administrador,
      contaId: IDS.contaDaAna,
      localId: null,
      criadaEm: '2026-09-28T12:00:00.000Z',
    },
  ];
  const auditoria: Registro[] = [
    registro(
      1,
      '2026-10-06T14:32:00.000Z',
      'pessoa.criada',
      'Pessoa cadastrada',
      { tipo: 'pessoa', id: IDS.daniel, nome: 'Daniel Rocha', usuario: null },
      'K3PD-8WQA',
    ),
    registro(
      2,
      '2026-10-05T09:10:00.000Z',
      'local.criado',
      'Local cadastrado',
      { tipo: 'local', id: IDS.expedicao, nome: 'Jundiaí › Expedição', usuario: null },
      'R7K2-9QXM',
    ),
    registro(
      3,
      '2026-10-05T09:02:00.000Z',
      'entrada.concluida',
      'Entrada concluída',
      { tipo: 'conta', id: IDS.contaDaAna, nome: 'Ana Souza', usuario: 'ana.souza' },
      'M2VX-4HTB',
    ),
  ];
  const tarefasComFalha: TarefaComFalha[] = [
    manutencaoQueFalhou(IDS.manutencaoDeOntem, '2026-10-06T06:31:00.000Z'),
    manutencaoQueFalhou(IDS.manutencaoDeAnteontem, '2026-10-05T06:31:00.000Z'),
  ];
  return { locais, pessoas, contas, perfis, atribuicoes, auditoria, tarefasComFalha };
}

interface Resposta {
  status: number;
  json: unknown;
}

const ok = (json: unknown, status = 200): Resposta => ({ status, json });

const naoEncontrado = (detalhe: string): Resposta => ({
  status: 404,
  json: {
    type: 'urn:grafite:problema:nao-encontrado',
    title: 'Não encontrado',
    status: 404,
    detail: detalhe,
    codigoDeRastreio: 'T5EX-2E2E',
  },
});

type Corpo = Record<string, unknown>;
type Responder = (partes: string[], busca: URLSearchParams, corpo: Corpo) => Resposta;

/**
 * Liga a API simulada à página. Devolve o estado, para o teste conferir o que mudou, e os pedidos
 * que chegaram, com o corpo das escritas.
 */
export async function simularAdministracao(pagina: Page) {
  const estado = estadoInicial();
  const pedidos: PedidoFeito[] = [];

  const localDoEscopo = (localId: string) => ({
    id: localId,
    caminho: montarArvore(estado.locais).caminho(localId),
    situacao: 'ativo' as const,
  });
  const contaDa = (pessoaId: string) => estado.contas.find((conta) => conta.pessoaId === pessoaId);
  const perfilDe = (perfilId: unknown) => estado.perfis.find((perfil) => perfil.id === perfilId);
  const declaradas = (perfil: Perfil): Permissao[] =>
    perfil.todasAsPermissoes ? PERMISSOES.map((permissao) => permissao.chave) : perfil.permissoes;

  function contaDaFicha(conta: ContaGuardada): Conta {
    const propria = conta.id === IDS.contaDaAna;
    return {
      id: conta.id,
      usuario: conta.usuario,
      situacao: 'ativa',
      exigeDoisPassos: conta.exigeDoisPassos,
      doisPassos: conta.doisPassos,
      senhaTemporaria: conta.senhaTemporaria,
      entradaBloqueadaAte: null,
      ultimaEntradaEm: conta.senhaTemporaria ? null : '2026-10-06T11:20:00.000Z',
      permite: {
        editar: !propria,
        redefinir: !propria,
        removerDoisPassos: !propria && conta.doisPassos === 'ativa',
        desbloquear: false,
        inativar: !propria,
        reativar: false,
        encerrarSessoes: !propria,
      },
    };
  }

  function fichaDa(guardada: PessoaGuardada): Ficha {
    const conta = contaDa(guardada.id);
    const ativa = guardada.situacao === 'ativa';
    return {
      ...guardada,
      local: guardada.localId ? localDoEscopo(guardada.localId) : null,
      conta: conta ? contaDaFicha(conta) : null,
      permite: {
        editar: ativa,
        inativar: ativa && guardada.id !== IDS.ana,
        reativar: guardada.situacao === 'inativa',
        anonimizar: guardada.situacao === 'inativa',
        criarConta: ativa && !conta,
        administrarConta: conta !== undefined,
      },
    };
  }

  /** As permissões da conta, de cada atribuição, com o escopo e a origem, na ordem do catálogo. */
  function permissoesDa(contaId: string): PermissaoEfetiva[] {
    const porChave = new Map<Permissao, PermissaoEfetiva>();
    for (const atribuicao of estado.atribuicoes.filter((atual) => atual.contaId === contaId)) {
      const perfil = perfilDe(atribuicao.perfilId);
      if (!perfil) continue;
      const noLocal = atribuicao.localId ? localDoEscopo(atribuicao.localId) : null;
      for (const chave of fechamento(declaradas(perfil))) {
        if (noLocal && definicaoDa(chave).escopo === 'organizacao') continue;
        const efetiva = porChave.get(chave) ?? {
          chave,
          organizacao: false,
          locais: [],
          origens: [],
        };
        if (noLocal) efetiva.locais.push({ id: noLocal.id, caminho: noLocal.caminho });
        else efetiva.organizacao = true;
        efetiva.origens.push({
          atribuicaoId: atribuicao.id,
          perfil: { id: perfil.id, nome: perfil.nome },
          grupo: null,
          local: noLocal && { id: noLocal.id, caminho: noLocal.caminho },
        });
        porChave.set(chave, efetiva);
      }
    }
    const ordem: string[] = PERMISSOES.map((permissao) => permissao.chave);
    return [...porChave.values()].sort((a, b) => ordem.indexOf(a.chave) - ordem.indexOf(b.chave));
  }

  function acessoDa(contaId: string): Resposta {
    const conta = estado.contas.find((atual) => atual.id === contaId);
    if (!conta) return naoEncontrado('A conta não existe.');
    const atribuicoes = estado.atribuicoes.flatMap((atribuicao) => {
      const perfil = perfilDe(atribuicao.perfilId);
      return atribuicao.contaId === contaId && perfil ? [{ atribuicao, perfil }] : [];
    });
    const acesso: Esquemas['AcessoDaConta'] = {
      atribuicoes: atribuicoes.map(({ atribuicao, perfil }) => ({
        id: atribuicao.id,
        perfil: { id: perfil.id, nome: perfil.nome, situacao: perfil.situacao },
        local: atribuicao.localId ? localDoEscopo(atribuicao.localId) : null,
        grupo: null,
        criadaEm: atribuicao.criadaEm,
        permite: { encerrar: !perfil.protegido },
      })),
      grupos: [],
      permissoes: permissoesDa(contaId),
      exigeDoisPassos: {
        conta: conta.exigeDoisPassos,
        perfis: atribuicoes
          .filter(({ perfil }) => perfil.exigeDoisPassos)
          .map(({ perfil }) => perfil.nome),
      },
      permite: { atribuir: true },
    };
    return ok(acesso);
  }

  function listarPessoas(busca: URLSearchParams): Resposta {
    const texto = normalizarTexto(busca.get('busca') ?? '');
    const situacao = { ativas: 'ativa', inativas: 'inativa' }[busca.get('situacao') ?? 'ativas'];
    const itens = estado.pessoas
      .filter((guardada) => !situacao || guardada.situacao === situacao)
      .filter((guardada) =>
        [guardada.nome, guardada.matricula, guardada.email, contaDa(guardada.id)?.usuario].some(
          (campo) => campo && normalizarTexto(campo).includes(texto),
        ),
      )
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((guardada): Esquemas['Pessoa'] => {
        const { conta, ...ficha } = fichaDa(guardada);
        return {
          ...ficha,
          conta: conta && { id: conta.id, usuario: conta.usuario, situacao: conta.situacao },
        };
      });
    return ok({ itens, proximo: null, total: itens.length });
  }

  function cadastrarPessoa(corpo: Corpo): Resposta {
    const nova: PessoaGuardada = {
      id: randomUUID(),
      nome: String(corpo.nome),
      email: (corpo.email as string | null) ?? null,
      matricula: (corpo.matricula as string | null) ?? null,
      telefone: (corpo.telefone as string | null) ?? null,
      situacao: 'ativa',
      localId: (corpo.localId as string | null) ?? null,
      foto: null,
    };
    estado.pessoas.push(nova);
    return ok(fichaDa(nova), 201);
  }

  function criarConta(pessoaId: string, corpo: Corpo): Resposta {
    if (!estado.pessoas.some((guardada) => guardada.id === pessoaId)) {
      return naoEncontrado('A pessoa não existe.');
    }
    const conta: ContaGuardada = {
      id: randomUUID(),
      pessoaId,
      usuario: String(corpo.usuario),
      exigeDoisPassos: corpo.exigeDoisPassos === true,
      doisPassos: 'desativada',
      senhaTemporaria: true,
    };
    estado.contas.push(conta);
    return ok({ conta: contaDaFicha(conta), senhaTemporaria: SENHA_TEMPORARIA }, 201);
  }

  function atribuir(corpo: Corpo): Resposta {
    const perfil = perfilDe(corpo.perfilId);
    const conta = estado.contas.find((atual) => atual.id === corpo.contaId);
    const dona = estado.pessoas.find((guardada) => guardada.id === conta?.pessoaId);
    if (!perfil || !conta || !dona) return naoEncontrado('O perfil ou a conta não existe.');
    const localId = (corpo.localId as string | null) ?? null;
    const atribuicao: AtribuicaoGuardada = {
      id: randomUUID(),
      perfilId: perfil.id,
      contaId: conta.id,
      localId,
      criadaEm: new Date().toISOString(),
    };
    estado.atribuicoes.push(atribuicao);
    perfil.atribuicoes += 1;
    const criada: Esquemas['AtribuicaoCriada'] = {
      atribuicao: {
        id: atribuicao.id,
        perfil: { id: perfil.id, nome: perfil.nome, situacao: perfil.situacao },
        conta: { id: conta.id, pessoaId: dona.id, nome: dona.nome, usuario: conta.usuario },
        grupo: null,
        local: localId ? localDoEscopo(localId) : null,
        criadaEm: atribuicao.criadaEm,
      },
      ignoradas: localId
        ? declaradas(perfil).filter((chave) => definicaoDa(chave).escopo === 'organizacao')
        : [],
    };
    return ok(criada, 201);
  }

  function cadastrarLocal(corpo: Corpo): Resposta {
    const paiId = (corpo.paiId as string | null) ?? null;
    const novo = local(randomUUID(), paiId, String(corpo.nome), corpo.tipo as Local['tipo']);
    estado.locais.push(novo);
    return ok(novo, 201);
  }

  function moverLocal(localId: string, corpo: Corpo): Resposta {
    const movido = estado.locais.find((atual) => atual.id === localId);
    if (!movido) return naoEncontrado('O local não existe.');
    movido.paiId = (corpo.paiId as string | null) ?? null;
    return ok(movido);
  }

  /** A foto nova da pessoa, com outro id, como a API grava a cada envio; ou nenhuma. */
  function mudarFoto(pessoaId: string, foto: { id: string } | null): Resposta {
    const guardada = estado.pessoas.find((atual) => atual.id === pessoaId);
    if (!guardada) return naoEncontrado('A pessoa não existe.');
    guardada.foto = foto;
    return ok(fichaDa(guardada));
  }

  /** A tarefa volta à fila e sai da lista das tarefas com falha. */
  function repetirTarefa(tarefaId: string): Resposta {
    const posicao = estado.tarefasComFalha.findIndex((tarefa) => tarefa.id === tarefaId);
    if (posicao === -1) return naoEncontrado('A tarefa não está mais na lista.');
    estado.tarefasComFalha.splice(posicao, 1);
    return { status: 204, json: null };
  }

  function consultarAuditoria(busca: URLSearchParams): Resposta {
    const rastreio = busca.get('rastreio');
    const acao = busca.get('acao');
    const alvos = busca.getAll('alvo');
    const itens = estado.auditoria
      .filter((atual) => !rastreio || atual.codigoDeRastreio === rastreio)
      .filter((atual) => !acao || atual.acao === acao)
      .filter(
        (atual) => alvos.length === 0 || alvos.includes(`${atual.alvo.tipo}:${atual.alvo.id}`),
      );
    if (busca.get('ordem') === 'antigos') itens.reverse();
    return ok({ itens, proximo: null, total: itens.length, maisDe: false });
  }

  const rotas: [string, RegExp, Responder][] = [
    ['GET', /^\/locais$/, () => ok({ locais: estado.locais, permite: { cadastrarNaRaiz: true } })],
    ['POST', /^\/locais$/, (_, __, corpo) => cadastrarLocal(corpo)],
    [
      'POST',
      /^\/locais\/([^/]+)\/movimento$/,
      ([localId = ''], _, corpo) => moverLocal(localId, corpo),
    ],
    ['GET', /^\/pessoas$/, (_, busca) => listarPessoas(busca)],
    ['POST', /^\/pessoas$/, (_, __, corpo) => cadastrarPessoa(corpo)],
    [
      'GET',
      /^\/pessoas\/([^/]+)$/,
      ([pessoaId]) => {
        const guardada = estado.pessoas.find((atual) => atual.id === pessoaId);
        return guardada ? ok(fichaDa(guardada)) : naoEncontrado('A pessoa não existe.');
      },
    ],
    [
      'POST',
      /^\/pessoas\/([^/]+)\/conta$/,
      ([pessoaId = ''], _, corpo) => criarConta(pessoaId, corpo),
    ],
    [
      'PUT',
      /^\/pessoas\/([^/]+)\/foto$/,
      ([pessoaId = '']) => mudarFoto(pessoaId, { id: randomUUID() }),
    ],
    ['DELETE', /^\/pessoas\/([^/]+)\/foto$/, ([pessoaId = '']) => mudarFoto(pessoaId, null)],
    ['GET', /^\/contas\/([^/]+)\/sessoes$/, () => ok([])],
    ['GET', /^\/contas\/([^/]+)\/acesso$/, ([contaId = '']) => acessoDa(contaId)],
    ['GET', /^\/perfis$/, () => ok({ itens: estado.perfis, permite: { cadastrar: true } })],
    // A aba Acesso mostra os grupos ativos numa tabela; a organização simulada não tem nenhum.
    ['GET', /^\/grupos$/, () => ok({ itens: [], permite: { cadastrar: true } })],
    ['POST', /^\/atribuicoes$/, (_, __, corpo) => atribuir(corpo)],
    ['GET', /^\/auditoria$/, (_, busca) => consultarAuditoria(busca)],
    ['GET', /^\/auditoria\/contas$/, () => ok({ itens: [] })],
    ['GET', /^\/acesso\/administradores$/, () => ok({ administradores: ['Ana Souza'] })],
    ['GET', /^\/tarefas-com-falha$/, () => ok({ itens: estado.tarefasComFalha, proximo: null })],
    [
      'POST',
      /^\/tarefas-com-falha\/([^/]+)\/repeticao$/,
      ([tarefaId = '']) => repetirTarefa(tarefaId),
    ],
  ];

  await pagina.route(
    (url) => url.pathname.startsWith('/api/'),
    async (rota) => {
      const pedido = rota.request();
      const url = new URL(pedido.url());
      const caminho = url.pathname.slice('/api'.length);
      if (DA_FIXTURE.test(caminho)) return rota.fallback();
      const metodo = pedido.method();
      // As escritas vêm em JSON, e o envio de uma foto, nos bytes crus da imagem.
      const emJson = pedido.headers()['content-type']?.startsWith('application/json');
      const corpo: Corpo = (emJson && pedido.postDataJSON()) || {};
      pedidos.push({ metodo, caminho: url.pathname, busca: url.searchParams, corpo });
      const encontrada = rotas
        .map(([metodoDaRota, padrao, responder]) => ({
          partes: metodoDaRota === metodo ? caminho.match(padrao) : null,
          responder,
        }))
        .find(({ partes }) => partes !== null);
      const resposta = encontrada?.partes
        ? encontrada.responder(encontrada.partes.slice(1), url.searchParams, corpo)
        : {
            status: 501,
            json: {
              type: 'urn:grafite:problema:nao-simulado',
              title: 'Não simulado',
              status: 501,
              detail: `A API simulada não responde ${metodo} ${url.pathname}.`,
              codigoDeRastreio: 'T5EX-2E2E',
            },
          };
      await rota.fulfill(
        resposta.status === 204
          ? { status: 204 }
          : {
              status: resposta.status,
              contentType: resposta.status >= 400 ? 'application/problem+json' : 'application/json',
              body: JSON.stringify(resposta.json),
            },
      );
    },
  );

  return {
    estado,
    /** Os corpos das escritas no caminho, como "POST /api/pessoas", na ordem. */
    corposDe: (pedidoFeito: string) =>
      pedidos
        .filter(({ metodo, caminho }) => `${metodo} ${caminho}` === pedidoFeito)
        .map(({ corpo }) => corpo),
    /** Os parâmetros das consultas ao caminho, como "/api/auditoria", na ordem. */
    consultasA: (caminho: string) =>
      pedidos
        .filter((feito) => feito.metodo === 'GET' && feito.caminho === caminho)
        .map(({ busca }) => busca),
  };
}
