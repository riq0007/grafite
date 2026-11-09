// A API das ordens de serviço simulada, para as pontas a ponta do Operação (specs
// ordens-de-servico e modulo-operacao; change p4e-ordens-de-servico): a abertura, pela tela e pela
// solicitação de conserto, conferida pelo domínio; a lista, com as em aberto por padrão, a
// situação, a busca e o cursor; a ficha; a mudança da situação, com o fornecedor; a peça, que sai do
// livro-razão do estoque simulado com "OS <número>"; a resolução, que conclui a solicitação de
// origem; a reabertura, os encerramentos e o lote; e a seção da ficha do ativo. Ela fica sobre as
// simulações dos ativos, do estoque e das solicitações, e responde só os caminhos dela. A sessão
// simulada é a da administradora, que atende em todos os locais.
import { randomUUID } from 'node:crypto';
import type { components } from '@grafite/api-client';
import {
  type AcaoNaOrdem,
  acaoDoLoteDasOrdens,
  MENSAGEM_DA_ORDEM_SO_DO_CONSERTO,
  mensagemDaRecusaNaOrdem,
  mensagemDaSolicitacaoComOrdem,
  montarArvore,
  normalizarTexto,
  type RecusaNaOrdem,
  recusaNaOrdem,
  rotuloDoAtivo,
  type SituacaoDaOrdem,
  type SituacaoDeAtendimento,
  type SituacaoDoLoteDasOrdens,
  situacaoDepoisDaAcao,
  situacaoEmAberto,
  textoDaOrdem,
  textoDoLoteDasOrdens,
  validarAberturaDaOrdem,
  validarEncerramentoDaOrdem,
  validarMudancaDaOrdem,
  validarPecaDaOrdem,
  validarReaberturaDaOrdem,
  validarResolucaoDaOrdem,
} from '@grafite/domain';
import type { Page } from '@playwright/test';
import type { simularSolicitacoes } from './api-das-solicitacoes.ts';
import type { EstadoDoCatalogo } from './api-do-catalogo.ts';
import type { simularEstoque } from './api-do-estoque.ts';
import { type FornecedorGuardado, LOCAIS, PESSOAS } from './api-dos-ativos.ts';
import type { ConsumivelGuardado } from './api-dos-consumiveis.ts';

type Ordem = components['schemas']['OrdemDeServico'];

/** O ativo como a simulação dos ativos o guarda: o que as OS leem dele. */
interface AtivoDaSimulacao {
  id: string;
  tipoId: string;
  modeloId: string | null;
  valores: Record<string, unknown>;
  situacao: 'ativo' | 'inativo';
}

/** Uma mudança do histórico, da mais antiga para a mais nova. */
interface MudancaGuardada {
  id: string;
  situacao: SituacaoDaOrdem;
  texto: string | null;
  fornecedorId: string | null;
  mudadaEm: string;
}

/** Uma peça lançada, com a movimentação dela no estoque simulado. */
interface PecaGuardada {
  id: string;
  consumivelId: string;
  quantidade: number;
  localId: string;
  movimentoId: string;
  lancadaEm: string;
}

/** Uma OS guardada, com as referências pelo id. */
interface OrdemGuardada {
  id: string;
  numero: number;
  ativoId: string;
  solicitacaoId: string | null;
  problema: string;
  situacao: SituacaoDaOrdem;
  fornecedorId: string | null;
  osDoFornecedor: string | null;
  solucao: string | null;
  motivoDoEncerramento: string | null;
  abertaEm: string;
  resolvidaEm: string | null;
  encerradaEm: string | null;
  historico: MudancaGuardada[];
  pecas: PecaGuardada[];
}

/** Uma OS que a organização já tem: aberta no ativo e, com o que foi feito, já resolvida. */
export interface OrdemSemeada {
  ativo: string;
  problema: string;
  solucao?: string;
}

type Corpo = Record<string, unknown>;
type Resposta = { status: number; json: unknown };

const ok = (json: unknown, status = 200): Resposta => ({ status, json });
const problema = (
  status: number,
  codigo: string,
  detalhe: string,
  campos?: Record<string, string>,
): Resposta => ({
  status,
  json: {
    type: `urn:grafite:problema:${codigo}`,
    title: detalhe,
    status,
    detail: detalhe,
    codigoDeRastreio: 'S1MU-L4D0',
    ...(campos ? { campos } : {}),
  },
});
const recusa = (status: number, campos: Record<string, string>) =>
  problema(
    status,
    status === 400 ? 'dados-invalidos' : 'conflito',
    Object.keys(campos).length === 1
      ? (Object.values(campos)[0] ?? '')
      : 'Confira os campos indicados.',
    campos,
  );

const DAS_ORDENS = /^\/ordens(\/|$)|^\/ativos\/[^/]+\/ordens$|^\/solicitacoes\/\d+\/ordem$/;

/** A conta da sessão simulada, que abre e atende. */
const QUEM_ATENDE = { id: '0199a6e0-0000-7000-8000-0000000000c1', nome: 'Ana Souza' };

export async function simularOrdens(
  pagina: Page,
  {
    catalogo,
    fornecedores,
    ativos,
    consumiveis,
    estoque,
    solicitacoes,
  }: {
    catalogo: EstadoDoCatalogo;
    fornecedores: FornecedorGuardado[];
    ativos: AtivoDaSimulacao[];
    consumiveis: ConsumivelGuardado[];
    estoque: Awaited<ReturnType<typeof simularEstoque>>;
    solicitacoes: Awaited<ReturnType<typeof simularSolicitacoes>>;
  },
  semeadas: OrdemSemeada[] = [],
) {
  const ordens: OrdemGuardada[] = [];
  let ultimoNumero = 11;
  const arvore = montarArvore(LOCAIS);
  const daSolicitacao = solicitacoes.paraAsOrdens;

  const ativoDe = (id: string | null) => ativos.find((ativo) => ativo.id === id);
  const localDoAtivo = (ativo: AtivoDaSimulacao) =>
    (ativo.valores['ativo.local'] as string | undefined) ?? null;
  const patrimonioDe = (ativo: AtivoDaSimulacao) =>
    (ativo.valores['ativo.patrimonio'] as string | undefined) ?? null;
  const rotuloDe = (ativo: AtivoDaSimulacao) => {
    const tipo = catalogo.tipos.find((outro) => outro.id === ativo.tipoId);
    const modelo = catalogo.modelos.find((outro) => outro.id === ativo.modeloId);
    return rotuloDoAtivo({
      nome: (ativo.valores['ativo.nome'] as string | undefined) ?? null,
      modelo: modelo ?? null,
      tipo: tipo ?? { nome: '' },
    });
  };
  const local = (id: string | null) => (id ? { id, caminho: arvore.caminho(id) } : null);
  const fornecedorDe = (id: string | null) => fornecedores.find((outro) => outro.id === id);
  const referenciaDoFornecedor = (id: string | null) => {
    const fornecedor = fornecedorDe(id);
    return fornecedor ? { id: fornecedor.id, nome: fornecedor.nome, abrir: true } : null;
  };
  const localDa = (o: OrdemGuardada) => {
    const ativo = ativoDe(o.ativoId);
    return ativo ? localDoAtivo(ativo) : null;
  };

  function comoOrdem(o: OrdemGuardada): Ordem {
    const ativo = ativoDe(o.ativoId);
    const solicitacao = daSolicitacao.peloId(o.solicitacaoId);
    const pessoa = PESSOAS.find((outra) => outra.id === solicitacao?.dados.pessoa);
    return {
      id: o.id,
      numero: o.numero,
      situacao: o.situacao,
      ativo: {
        id: o.ativoId,
        rotulo: ativo ? rotuloDe(ativo) : '',
        patrimonio: ativo ? patrimonioDe(ativo) : null,
        abrir: true,
      },
      local: local(localDa(o)),
      solicitacao: solicitacao
        ? {
            id: solicitacao.id,
            numero: solicitacao.numero,
            pessoa: { id: pessoa?.id ?? '', nome: pessoa?.nome ?? '' },
          }
        : null,
      problema: o.problema,
      fornecedor: referenciaDoFornecedor(o.fornecedorId),
      osDoFornecedor: o.osDoFornecedor,
      solucao: o.solucao,
      motivoDoEncerramento: o.motivoDoEncerramento,
      abertaPor: QUEM_ATENDE,
      abertaEm: o.abertaEm,
      resolvidaPor: o.resolvidaEm ? QUEM_ATENDE : null,
      resolvidaEm: o.resolvidaEm,
      encerradaPor: o.encerradaEm ? QUEM_ATENDE : null,
      encerradaEm: o.encerradaEm,
      historico: [...o.historico].reverse().map((mudanca) => ({
        id: mudanca.id,
        situacao: mudanca.situacao,
        texto: mudanca.texto,
        fornecedor: referenciaDoFornecedor(mudanca.fornecedorId),
        mudadaPor: QUEM_ATENDE,
        mudadaEm: mudanca.mudadaEm,
      })),
      pecas: o.pecas.map((peca) => {
        const consumivel = consumiveis.find((outro) => outro.id === peca.consumivelId);
        return {
          id: peca.id,
          consumivel: {
            id: peca.consumivelId,
            codigo: consumivel?.codigo ?? '',
            nome: consumivel?.nome ?? null,
            abrir: true,
          },
          quantidade: peca.quantidade,
          local: { id: peca.localId, caminho: arvore.caminho(peca.localId) },
          movimento: peca.movimentoId,
          lancadaPor: QUEM_ATENDE,
          lancadaEm: peca.lancadaEm,
        };
      }),
      permite: { atender: true },
    };
  }

  // A OS de cada solicitação, para a lista e a ficha dela.
  daSolicitacao.seguir((id) => {
    const o = ordens.find((outra) => outra.solicitacaoId === id);
    return o ? { numero: o.numero, situacao: o.situacao, abrir: true } : null;
  });

  /** O que a busca acha: o número, o ativo, o problema e a OS do fornecedor. */
  const textoDaBusca = (o: OrdemGuardada) => {
    const ativo = ativoDe(o.ativoId);
    return normalizarTexto(
      [
        String(o.numero),
        ativo ? `${rotuloDe(ativo)} ${patrimonioDe(ativo) ?? ''}` : '',
        o.problema,
        o.osDoFornecedor ?? '',
      ].join(' '),
    );
  };

  function listar(busca: URLSearchParams): Resposta {
    const situacao = busca.get('situacao') ?? 'em-aberto';
    const doLocal = busca.get('local');
    const ramo = doLocal && arvore.local(doLocal) ? arvore.ramo(doLocal) : null;
    const palavras = normalizarTexto(busca.get('busca') ?? '')
      .split(' ')
      .filter(Boolean);
    const todas = [...ordens].reverse().filter((o) => {
      const doAtivo = localDa(o);
      return (
        (situacao === 'todas' ||
          (situacao === 'em-aberto' ? situacaoEmAberto(o.situacao) : o.situacao === situacao)) &&
        (!ramo || (doAtivo !== null && ramo.has(doAtivo))) &&
        palavras.every((palavra) => textoDaBusca(o).includes(palavra))
      );
    });
    const inicio = Number(busca.get('cursor') ?? 0);
    const limite = Number(busca.get('limite') ?? 50);
    return ok({
      itens: todas.slice(inicio, inicio + limite).map(comoOrdem),
      total: todas.length,
      proximo: inicio + limite < todas.length ? String(inicio + limite) : null,
    });
  }

  /** A mudança da situação, com a linha do histórico. */
  function aplicar(
    o: OrdemGuardada,
    nova: SituacaoDaOrdem,
    texto: string | null,
    fornecedorId: string | null = null,
  ) {
    const agora = new Date().toISOString();
    o.situacao = nova;
    o.historico.push({ id: randomUUID(), situacao: nova, texto, fornecedorId, mudadaEm: agora });
    return agora;
  }

  function abrir(corpo: Corpo, solicitacaoId: string | null = null): Resposta {
    const ativo = (corpo.ativo as string | null | undefined) ?? null;
    const descrito = (corpo.problema as string | null | undefined) ?? null;
    const erros = validarAberturaDaOrdem({ ativo, problema: descrito });
    if (Object.keys(erros).length > 0) return recusa(400, erros as Record<string, string>);
    const doAtivo = ativoDe(ativo);
    if (!doAtivo) return recusa(400, { ativo: 'Ativo não encontrado.' });
    if (doAtivo.situacao !== 'ativo')
      return recusa(409, { ativo: 'O ativo escolhido está inativo.' });
    ultimoNumero += 1;
    const agora = new Date().toISOString();
    const guardada: OrdemGuardada = {
      id: randomUUID(),
      numero: ultimoNumero,
      ativoId: doAtivo.id,
      solicitacaoId,
      problema: (descrito ?? '').trim(),
      situacao: 'aberta',
      fornecedorId: null,
      osDoFornecedor: null,
      solucao: null,
      motivoDoEncerramento: null,
      abertaEm: agora,
      resolvidaEm: null,
      encerradaEm: null,
      historico: [
        { id: randomUUID(), situacao: 'aberta', texto: null, fornecedorId: null, mudadaEm: agora },
      ],
      pecas: [],
    };
    ordens.push(guardada);
    return ok(comoOrdem(guardada), 201);
  }

  /** A OS do conserto pendente, com o ativo e o defeito; a solicitação passa a Em atendimento. */
  function abrirPelaSolicitacao(numero: number): Resposta {
    const s = daSolicitacao.peloNumero(numero);
    if (!s) return problema(404, 'nao-encontrado', 'Solicitação não encontrada.');
    if (!daSolicitacao.pendente(s)) {
      return problema(409, 'conflito', `A solicitação ${s.numero} já está encerrada.`);
    }
    if (s.dados.tipo !== 'conserto') {
      return problema(409, 'conflito', MENSAGEM_DA_ORDEM_SO_DO_CONSERTO);
    }
    const ja = ordens.find((outra) => outra.solicitacaoId === s.id);
    if (ja) return problema(409, 'conflito', mensagemDaSolicitacaoComOrdem(s.numero, ja.numero));
    const aberta = abrir({ ativo: s.dados.ativo, problema: s.dados.defeito }, s.id);
    if (aberta.status === 201) s.situacao = 'em-atendimento';
    return aberta;
  }

  /** A recusa da ação na situação atual, como a API a dá. */
  const recusada = (o: OrdemGuardada, acao: AcaoNaOrdem): Resposta | null => {
    const motivo = recusaNaOrdem(o.situacao, acao);
    return motivo ? problema(409, 'conflito', mensagemDaRecusaNaOrdem(o.numero, motivo)) : null;
  };

  function mudar(o: OrdemGuardada, corpo: Corpo): Resposta {
    const nova = corpo.situacao as SituacaoDeAtendimento;
    const barrada = recusada(o, { acao: 'mudar', nova });
    if (barrada) return barrada;
    const observacao = (corpo.observacao as string | null | undefined) ?? null;
    const fornecedor = (corpo.fornecedor as string | null | undefined) ?? null;
    const os = (corpo.os as string | null | undefined) ?? null;
    const erros = validarMudancaDaOrdem({
      situacao: nova,
      observacao,
      fornecedor: { fornecedor, os },
    });
    if (Object.keys(erros).length > 0) return recusa(400, erros as Record<string, string>);
    const doFornecedor = nova === 'aguardando-fornecedor';
    if (doFornecedor) {
      if (!fornecedorDe(fornecedor))
        return recusa(400, { fornecedor: 'Fornecedor não encontrado.' });
      o.fornecedorId = fornecedor;
      o.osDoFornecedor = os;
    }
    aplicar(o, nova, observacao, doFornecedor ? fornecedor : null);
    return ok(comoOrdem(o));
  }

  function lancarPeca(o: OrdemGuardada, corpo: Corpo): Resposta {
    const barrada = recusada(o, { acao: 'lancar-peca' });
    if (barrada) return barrada;
    const pedido = {
      consumivel: (corpo.consumivel as string | null | undefined) ?? null,
      local: (corpo.local as string | null | undefined) ?? null,
      quantidade: (corpo.quantidade as number | null | undefined) ?? null,
    };
    const erros = validarPecaDaOrdem(pedido);
    if (Object.keys(erros).length > 0) return recusa(400, erros as Record<string, string>);
    const lancado = estoque.lancar('saida', {
      consumivel: pedido.consumivel,
      quantidade: pedido.quantidade,
      origem: pedido.local,
      ativo: o.ativoId,
      observacao: textoDaOrdem(o.numero),
    });
    if (lancado.status >= 400) {
      // A recusa da saída no campo da peça: a origem é o local.
      const campos = (lancado.json as { campos?: Record<string, string> }).campos ?? {};
      return recusa(
        lancado.status,
        Object.fromEntries(
          Object.entries(campos).map(([campo, motivo]) => [
            campo === 'origem' ? 'local' : campo,
            motivo,
          ]),
        ),
      );
    }
    o.pecas.push({
      id: randomUUID(),
      consumivelId: pedido.consumivel ?? '',
      quantidade: pedido.quantidade ?? 0,
      localId: pedido.local ?? '',
      movimentoId: estoque.movimentos.at(-1)?.id ?? '',
      lancadaEm: new Date().toISOString(),
    });
    return ok(comoOrdem(o));
  }

  /** A solicitação de origem segue a OS resolvida e a encerrada sem resolver. */
  function seguirNaSolicitacao(
    o: OrdemGuardada,
    mudanca: { nova: 'concluida'; oQueFoiFeito: string } | { nova: 'cancelada'; motivo: string },
  ) {
    const s = daSolicitacao.peloId(o.solicitacaoId);
    if (!s || !daSolicitacao.pendente(s)) return;
    if (mudanca.nova === 'concluida') s.oQueFoiFeito = mudanca.oQueFoiFeito;
    else s.motivoDoCancelamento = mudanca.motivo;
    daSolicitacao.encerrar(s, mudanca.nova);
  }

  function resolver(o: OrdemGuardada, corpo: Corpo): Resposta {
    const barrada = recusada(o, { acao: 'resolver' });
    if (barrada) return barrada;
    const solucao = ((corpo.solucao as string | null | undefined) ?? '').trim() || null;
    const erro = validarResolucaoDaOrdem(solucao);
    if (erro) return recusa(400, { solucao: erro });
    o.solucao = solucao;
    o.resolvidaEm = aplicar(o, 'resolvida', solucao);
    seguirNaSolicitacao(o, { nova: 'concluida', oQueFoiFeito: solucao ?? '' });
    return ok(comoOrdem(o));
  }

  function reabrir(o: OrdemGuardada, corpo: Corpo): Resposta {
    const barrada = recusada(o, { acao: 'reabrir' });
    if (barrada) return barrada;
    const motivo = ((corpo.motivo as string | null | undefined) ?? '').trim() || null;
    const erro = validarReaberturaDaOrdem(motivo);
    if (erro) return recusa(400, { motivo: erro });
    o.solucao = null;
    o.resolvidaEm = null;
    aplicar(o, situacaoDepoisDaAcao({ acao: 'reabrir' }), motivo);
    return ok(comoOrdem(o));
  }

  function encerrar(o: OrdemGuardada, corpo: Corpo): Resposta {
    const semResolver = corpo.semResolver === true;
    const barrada = recusada(o, { acao: semResolver ? 'encerrar-sem-resolver' : 'encerrar' });
    if (barrada) return barrada;
    const motivo = ((corpo.motivo as string | null | undefined) ?? '').trim() || null;
    if (semResolver) {
      const erro = validarEncerramentoDaOrdem(motivo);
      if (erro) return recusa(400, { motivo: erro });
      o.motivoDoEncerramento = motivo;
    }
    o.encerradaEm = aplicar(o, 'encerrada', semResolver ? motivo : null);
    if (semResolver) seguirNaSolicitacao(o, { nova: 'cancelada', motivo: motivo ?? '' });
    return ok(comoOrdem(o));
  }

  function lote(corpo: Corpo): Resposta {
    const numeros = [...((corpo.numeros as number[] | undefined) ?? [])].sort((a, b) => a - b);
    const acao = acaoDoLoteDasOrdens(corpo.situacao as SituacaoDoLoteDasOrdens);
    let mudaram = 0;
    const recusadas: { numero: number; recusa: RecusaNaOrdem }[] = [];
    for (const numero of numeros) {
      const o = ordens.find((outra) => outra.numero === numero);
      const motivo: RecusaNaOrdem | null = o
        ? recusaNaOrdem(o.situacao, acao)
        : { motivo: 'nao-encontrada' };
      if (motivo || !o) {
        recusadas.push({ numero, recusa: motivo ?? { motivo: 'nao-encontrada' } });
        continue;
      }
      const agora = aplicar(o, situacaoDepoisDaAcao(acao), null);
      if (acao.acao === 'encerrar') o.encerradaEm = agora;
      mudaram += 1;
    }
    return ok({
      mudaram,
      recusadas: recusadas.map(({ numero, recusa: motivo }) => ({
        numero,
        mensagem: mensagemDaRecusaNaOrdem(numero, motivo),
      })),
      texto: textoDoLoteDasOrdens({ mudaram, recusadas }),
    });
  }

  function responder(metodo: string, caminho: string, busca: URLSearchParams, corpo: Corpo) {
    if (metodo === 'GET' && caminho === '/ordens') return listar(busca);
    if (metodo === 'POST' && caminho === '/ordens') return abrir(corpo);
    if (metodo === 'POST' && caminho === '/ordens/situacao') return lote(corpo);
    const pelaSolicitacao = /^\/solicitacoes\/(\d+)\/ordem$/.exec(caminho);
    if (metodo === 'POST' && pelaSolicitacao) {
      return abrirPelaSolicitacao(Number(pelaSolicitacao[1]));
    }
    const doAtivo = /^\/ativos\/([^/]+)\/ordens$/.exec(caminho);
    if (metodo === 'GET' && doAtivo) {
      const doAtivoAqui = [...ordens].reverse().filter((o) => o.ativoId === doAtivo[1]);
      return ok({
        emAberto: doAtivoAqui.filter((o) => situacaoEmAberto(o.situacao)).map(comoOrdem),
        resolvidasOuEncerradas: doAtivoAqui
          .filter((o) => !situacaoEmAberto(o.situacao))
          .slice(0, 5)
          .map(comoOrdem),
      });
    }
    const daOrdem = /^\/ordens\/(\d+)(?:\/([a-z]+))?$/.exec(caminho);
    const o = daOrdem ? ordens.find((outra) => outra.numero === Number(daOrdem[1])) : undefined;
    if (daOrdem && !o) return problema(404, 'nao-encontrado', 'Ordem de serviço não encontrada.');
    if (o && daOrdem) {
      const acao = daOrdem[2];
      if (metodo === 'GET' && !acao) return ok(comoOrdem(o));
      if (metodo === 'POST' && acao === 'situacao') return mudar(o, corpo);
      if (metodo === 'POST' && acao === 'pecas') return lancarPeca(o, corpo);
      if (metodo === 'POST' && acao === 'resolucao') return resolver(o, corpo);
      if (metodo === 'POST' && acao === 'reabertura') return reabrir(o, corpo);
      if (metodo === 'POST' && acao === 'encerramento') return encerrar(o, corpo);
    }
    return problema(501, 'nao-simulado', `${metodo} ${caminho} não é simulado.`);
  }

  for (const semeada of semeadas) {
    const aberta = abrir({ ativo: semeada.ativo, problema: semeada.problema });
    if (aberta.status !== 201) {
      throw new Error(`A OS semeada foi recusada: ${JSON.stringify(aberta.json)}`);
    }
    const guardada = ordens.at(-1);
    if (guardada && semeada.solucao) resolver(guardada, { solucao: semeada.solucao });
  }

  await pagina.route(
    (url) => url.pathname.startsWith('/api/'),
    async (rota) => {
      const pedido = rota.request();
      const url = new URL(pedido.url());
      const caminho = url.pathname.slice('/api'.length);
      if (!DAS_ORDENS.test(caminho)) return rota.fallback();
      const metodo = pedido.method();
      const corpo: Corpo = (metodo !== 'GET' && pedido.postDataJSON()) || {};
      const resposta = responder(metodo, caminho, url.searchParams, corpo);
      await rota.fulfill({
        status: resposta.status,
        contentType: resposta.status >= 400 ? 'application/problem+json' : 'application/json',
        body: JSON.stringify(resposta.json),
      });
    },
  );

  return {
    /** A OS guardada pelo número, como a API a lê. */
    ordem: (numero: number) => {
      const o = ordens.find((outra) => outra.numero === numero);
      return o ? comoOrdem(o) : undefined;
    },
  };
}
