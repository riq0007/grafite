// A API das solicitações simulada, para as pontas a ponta do Operação (specs solicitacoes e
// modulo-operacao; change p4d-solicitacoes): o registro, conferido pelo domínio, com a sugestão de
// cada item; a lista, com as pendentes por padrão, os filtros, a busca e o cursor; a ficha; a escolha
// das impressoras; o pedido ao fornecedor; a entrega, que sai do livro-razão do estoque simulado; a
// conclusão, o cancelamento e o lote; e a seção da ficha do ativo. Ela fica sobre as simulações dos
// ativos, dos consumíveis e do estoque, e responde só os caminhos dela. A sessão simulada é a da
// administradora, que atende em todos os locais. A simulação das OS (change p4e-ordens-de-servico)
// abre a OS do conserto e o encerra com ela, e diz a OS que cada solicitação segue.
import { randomUUID } from 'node:crypto';
import type { components } from '@grafite/api-client';
import {
  CORES_DE_CONSUMIVEL,
  type CorDeConsumivel,
  type DadosDaSolicitacao,
  type EntregaDoItem,
  limparSolicitacao,
  locaisDaSolicitacao,
  montarArvore,
  normalizarTexto,
  type RecusaDaSituacao,
  recusaDaSituacao,
  rotuloDoAtivo,
  SITUACOES_PENDENTES,
  type SituacaoDaSolicitacao,
  type SituacaoDeDestino,
  sugestaoDoConsumivel,
  textoDoLote,
  validarCancelamento,
  validarEntrega,
  validarPedidoAoFornecedor,
  validarSolicitacao,
} from '@grafite/domain';
import type { Page } from '@playwright/test';
import type { EstadoDoCatalogo } from './api-do-catalogo.ts';
import type { simularEstoque } from './api-do-estoque.ts';
import { type FornecedorGuardado, LOCAIS, PESSOAS } from './api-dos-ativos.ts';
import { COMPATIBILIDADE, type ConsumivelGuardado } from './api-dos-consumiveis.ts';

type Solicitacao = components['schemas']['Solicitacao'];

/** O ativo como a simulação dos ativos o guarda: o que as solicitações leem dele. */
interface AtivoDaSimulacao {
  id: string;
  tipoId: string;
  modeloId: string | null;
  valores: Record<string, unknown>;
  situacao: 'ativo' | 'inativo';
}

/** Um item do toner guardado, com a entrega dele. */
interface ItemGuardado {
  id: string;
  impressoraId: string;
  cor: CorDeConsumivel;
  quantidade: number;
  consumivelId: string | null;
  entrega: {
    origem: 'estoque' | 'fornecedor';
    localId: string | null;
    movimentoId: string | null;
    fornecedorId: string | null;
    entregueEm: string;
  } | null;
}

/** Uma solicitação guardada, com as referências pelo id. */
export interface SolicitacaoGuardada {
  id: string;
  numero: number;
  dados: DadosDaSolicitacao;
  situacao: SituacaoDaSolicitacao;
  itens: ItemGuardado[];
  fornecedorId: string | null;
  osDoFornecedor: string | null;
  oQueFoiFeito: string | null;
  motivoDoCancelamento: string | null;
  registradaEm: string;
  encerradaEm: string | null;
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

const DAS_SOLICITACOES = /^\/(solicitacoes)(\/|$)|^\/ativos\/[^/]+\/solicitacoes$/;

/** A conta da sessão simulada, que registra e atende. */
const QUEM_ATENDE = { id: '0199a6e0-0000-7000-8000-0000000000c1', nome: 'Ana Souza' };

export async function simularSolicitacoes(
  pagina: Page,
  {
    catalogo,
    fornecedores,
    ativos,
    consumiveis,
    compativeisDoModelo,
    estoque,
  }: {
    catalogo: EstadoDoCatalogo;
    fornecedores: FornecedorGuardado[];
    ativos: AtivoDaSimulacao[];
    consumiveis: ConsumivelGuardado[];
    compativeisDoModelo: (
      modeloId: string,
    ) => { id: string; codigo: string; cor: CorDeConsumivel | null; nome: string | null }[];
    estoque: Awaited<ReturnType<typeof simularEstoque>>;
  },
  /** As solicitações que a organização já tem, registradas como a API as registraria. */
  semeadas: Corpo[] = [],
) {
  const solicitacoes: SolicitacaoGuardada[] = [];
  let ultimoNumero = 41;
  const arvore = montarArvore(LOCAIS);
  // A OS que cada solicitação segue, que a simulação das OS informa; sem ela, nenhuma.
  let ordemDaSolicitacao: (id: string) => Solicitacao['ordem'] = () => null;

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
  const usaConsumiveis = (ativo: AtivoDaSimulacao) =>
    catalogo.tipos
      .find((tipo) => tipo.id === ativo.tipoId)
      ?.capacidades.includes(COMPATIBILIDADE) ?? false;
  const referenciaDoAtivo = (ativo: AtivoDaSimulacao) => ({
    id: ativo.id,
    rotulo: rotuloDe(ativo),
    patrimonio: patrimonioDe(ativo),
    abrir: true,
  });
  const local = (id: string | null) => (id ? { id, caminho: arvore.caminho(id) } : null);
  const consumivelDe = (id: string | null) => consumiveis.find((outro) => outro.id === id);
  const referenciaDoConsumivel = (id: string | null) => {
    const consumivel = consumivelDe(id);
    return consumivel
      ? { id: consumivel.id, codigo: consumivel.codigo, nome: consumivel.nome, abrir: true }
      : null;
  };
  const fornecedorDe = (id: string | null) => fornecedores.find((outro) => outro.id === id);
  const referenciaDoFornecedor = (id: string | null) => {
    const fornecedor = fornecedorDe(id);
    return fornecedor ? { id: fornecedor.id, nome: fornecedor.nome, abrir: true } : null;
  };

  /** Os compatíveis da impressora para a cor, com o saldo somado do estoque simulado. */
  const compativeisDaCor = (ativo: AtivoDaSimulacao, cor: CorDeConsumivel) =>
    (ativo.modeloId ? compativeisDoModelo(ativo.modeloId) : [])
      .filter((compativel) => compativel.cor === cor)
      .map((compativel) => ({ ...compativel, saldo: estoque.saldoDe(compativel.id) }));

  const locaisDa = (s: SolicitacaoGuardada) => {
    const dados = s.dados;
    const doAtivo = (id: string | null) => {
      const ativo = ativoDe(id);
      return ativo ? localDoAtivo(ativo) : null;
    };
    switch (dados.tipo) {
      case 'toner':
        return locaisDaSolicitacao(dados.impressoras.map(doAtivo));
      case 'conserto':
        return locaisDaSolicitacao([doAtivo(dados.ativo)]);
      case 'equipamento':
        return locaisDaSolicitacao([dados.local]);
    }
  };

  function comoSolicitacao(s: SolicitacaoGuardada): Solicitacao {
    const dados = s.dados;
    const pessoa = PESSOAS.find((outra) => outra.id === dados.pessoa);
    const { locais, semLocal } = locaisDa(s);
    const tipoDeAtivo =
      dados.tipo === 'equipamento'
        ? catalogo.tipos.find((tipo) => tipo.id === dados.tipoDeAtivo)
        : undefined;
    const ativoDoConserto = dados.tipo === 'conserto' ? ativoDe(dados.ativo) : undefined;
    const encerrada = s.situacao === 'concluida' || s.situacao === 'cancelada';
    return {
      id: s.id,
      numero: s.numero,
      tipo: dados.tipo,
      situacao: s.situacao,
      pessoa: { id: dados.pessoa ?? '', nome: pessoa?.nome ?? '' },
      observacao: dados.observacao,
      locais: locais.map((id) => ({ id, caminho: arvore.caminho(id) })),
      semLocal,
      impressoras:
        dados.tipo === 'toner'
          ? dados.impressoras.flatMap((id) => {
              const ativo = ativoDe(id);
              if (!ativo) return [];
              return [
                {
                  ativo: referenciaDoAtivo(ativo),
                  contador: null,
                  itens: s.itens
                    .filter((item) => item.impressoraId === id)
                    .map((item) => ({
                      id: item.id,
                      cor: item.cor,
                      quantidade: item.quantidade,
                      consumivel: referenciaDoConsumivel(item.consumivelId),
                      entrega: item.entrega
                        ? {
                            origem: item.entrega.origem,
                            local: local(item.entrega.localId),
                            movimento: item.entrega.movimentoId,
                            fornecedor: referenciaDoFornecedor(item.entrega.fornecedorId),
                            entreguePor: QUEM_ATENDE,
                            entregueEm: item.entrega.entregueEm,
                          }
                        : null,
                    })),
                },
              ];
            })
          : [],
      ativo: ativoDoConserto ? referenciaDoAtivo(ativoDoConserto) : null,
      defeito: dados.tipo === 'conserto' ? dados.defeito : null,
      tipoDeAtivo: tipoDeAtivo ? { id: tipoDeAtivo.id, nome: tipoDeAtivo.nome } : null,
      quantidade: dados.tipo === 'equipamento' ? dados.quantidade : null,
      motivo: dados.tipo === 'equipamento' ? dados.motivo : null,
      local: dados.tipo === 'equipamento' ? local(dados.local) : null,
      fornecedor: referenciaDoFornecedor(s.fornecedorId),
      osDoFornecedor: s.osDoFornecedor,
      oQueFoiFeito: s.oQueFoiFeito,
      motivoDoCancelamento: s.motivoDoCancelamento,
      registradaPor: QUEM_ATENDE,
      registradaEm: s.registradaEm,
      encerradaPor: encerrada ? QUEM_ATENDE : null,
      encerradaEm: s.encerradaEm,
      permite: { atender: true },
      ordem: ordemDaSolicitacao(s.id),
    };
  }

  /** O que a busca acha: o número, quem pediu, os ativos e a OS. */
  const textoDaBusca = (s: SolicitacaoGuardada) => {
    const lida = comoSolicitacao(s);
    return normalizarTexto(
      [
        String(lida.numero),
        lida.pessoa.nome,
        ...lida.impressoras.map(({ ativo }) => `${ativo.rotulo} ${ativo.patrimonio ?? ''}`),
        lida.ativo ? `${lida.ativo.rotulo} ${lida.ativo.patrimonio ?? ''}` : '',
        lida.osDoFornecedor ?? '',
      ].join(' '),
    );
  };

  function listar(busca: URLSearchParams): Resposta {
    const situacao = busca.get('situacao') ?? 'pendentes';
    const tipo = busca.get('tipo');
    const doLocal = busca.get('local');
    const ramo = doLocal && arvore.local(doLocal) ? arvore.ramo(doLocal) : null;
    const palavras = normalizarTexto(busca.get('busca') ?? '')
      .split(' ')
      .filter(Boolean);
    const todas = [...solicitacoes]
      .reverse()
      .filter(
        (s) =>
          (situacao === 'todas' ||
            (situacao === 'pendentes'
              ? (SITUACOES_PENDENTES as readonly string[]).includes(s.situacao)
              : s.situacao === situacao)) &&
          (!tipo || s.dados.tipo === tipo) &&
          (!ramo || locaisDa(s).locais.some((id) => ramo.has(id))) &&
          palavras.every((palavra) => textoDaBusca(s).includes(palavra)),
      );
    const inicio = Number(busca.get('cursor') ?? 0);
    const limite = Number(busca.get('limite') ?? 50);
    return ok({
      itens: todas.slice(inicio, inicio + limite).map(comoSolicitacao),
      total: todas.length,
      proximo: inicio + limite < todas.length ? String(inicio + limite) : null,
    });
  }

  function registrar(corpo: Corpo): Resposta {
    const tipo = corpo.tipo as DadosDaSolicitacao['tipo'];
    const texto = (chave: string) => (corpo[chave] as string | null | undefined) ?? null;
    const dados: DadosDaSolicitacao =
      tipo === 'toner'
        ? {
            tipo,
            pessoa: texto('pessoa'),
            observacao: texto('observacao'),
            impressoras: (corpo.impressoras as string[] | undefined) ?? [],
            itens: ((corpo.itens as Corpo[] | undefined) ?? []).map((item) => ({
              impressora: (item.impressora as string | null | undefined) ?? null,
              cor: (item.cor as CorDeConsumivel | null | undefined) ?? null,
              quantidade: (item.quantidade as number | null | undefined) ?? null,
              consumivel: (item.consumivel as string | null | undefined) ?? null,
            })),
          }
        : tipo === 'conserto'
          ? {
              tipo,
              pessoa: texto('pessoa'),
              observacao: texto('observacao'),
              ativo: texto('ativo'),
              defeito: texto('defeito'),
            }
          : {
              tipo,
              pessoa: texto('pessoa'),
              observacao: texto('observacao'),
              tipoDeAtivo: texto('tipoDeAtivo'),
              quantidade: (corpo.quantidade as number | null | undefined) ?? null,
              motivo: texto('motivo'),
              local: texto('local'),
            };
    const erros = validarSolicitacao(dados);
    if (Object.keys(erros).length > 0) return recusa(400, erros);
    const limpos = limparSolicitacao(dados);
    const itens: ItemGuardado[] =
      limpos.tipo === 'toner'
        ? limpos.itens.map((item) => {
            const impressora = ativoDe(item.impressora);
            const compativeis =
              impressora && item.cor ? compativeisDaCor(impressora, item.cor) : [];
            return {
              id: randomUUID(),
              impressoraId: item.impressora ?? '',
              cor: item.cor ?? 'preto',
              quantidade: item.quantidade ?? 1,
              consumivelId:
                item.consumivel ??
                (item.cor
                  ? sugestaoDoConsumivel(
                      compativeis.map((compativel) => ({ ...compativel, ativo: true })),
                      item.cor,
                    )
                  : null),
              entrega: null,
            };
          })
        : [];
    ultimoNumero += 1;
    const guardada: SolicitacaoGuardada = {
      id: randomUUID(),
      numero: ultimoNumero,
      dados: limpos,
      situacao: 'aberta',
      itens,
      fornecedorId: null,
      osDoFornecedor: null,
      oQueFoiFeito: null,
      motivoDoCancelamento: null,
      registradaEm: new Date().toISOString(),
      encerradaEm: null,
    };
    solicitacoes.push(guardada);
    return ok(comoSolicitacao(guardada), 201);
  }

  const pendente = (s: SolicitacaoGuardada) =>
    (SITUACOES_PENDENTES as readonly string[]).includes(s.situacao);

  function encerrar(s: SolicitacaoGuardada, nova: SituacaoDeDestino) {
    s.situacao = nova;
    if (nova === 'concluida' || nova === 'cancelada') s.encerradaEm = new Date().toISOString();
  }

  function entregar(s: SolicitacaoGuardada, corpo: Corpo): Resposta {
    const entregas = ((corpo.entregas as Corpo[] | undefined) ?? []).map(
      (entrega): EntregaDoItem =>
        entrega.origem === 'estoque'
          ? {
              item: entrega.item as string,
              origem: 'estoque',
              consumivel: (entrega.consumivel as string | null | undefined) ?? null,
              local: (entrega.local as string | null | undefined) ?? null,
            }
          : {
              item: entrega.item as string,
              origem: 'fornecedor',
              fornecedor: (entrega.fornecedor as string | null | undefined) ?? s.fornecedorId,
              consumivel: (entrega.consumivel as string | null | undefined) ?? null,
            },
    );
    const erros = validarEntrega(entregas);
    if (Object.keys(erros).length > 0) return recusa(400, erros);
    // A entrega é uma só: os saldos voltam como estavam se um item for recusado.
    const antes = estoque.saldos.map((saldo) => ({ ...saldo }));
    const quantosMovimentos = estoque.movimentos.length;
    const feitas: { item: ItemGuardado; entrega: NonNullable<ItemGuardado['entrega']> }[] = [];
    for (const [indice, entrega] of entregas.entries()) {
      const item = s.itens.find((outro) => outro.id === entrega.item && outro.entrega === null);
      if (!item) return recusa(409, { [`entregas.${indice}.item`]: 'O item já foi entregue.' });
      let movimentoId: string | null = null;
      if (entrega.origem === 'estoque') {
        const lancado = estoque.lancar('saida', {
          consumivel: entrega.consumivel,
          quantidade: item.quantidade,
          origem: entrega.local,
          ativo: item.impressoraId,
          observacao: `Solicitação ${s.numero}`,
        });
        if (lancado.status >= 400) {
          estoque.saldos.splice(0, estoque.saldos.length, ...antes);
          estoque.movimentos.splice(quantosMovimentos);
          const campos = (lancado.json as { campos?: Record<string, string> }).campos ?? {};
          return recusa(
            lancado.status,
            Object.fromEntries(
              Object.entries(campos).map(([campo, motivo]) => [
                `entregas.${indice}.${campo === 'origem' ? 'local' : campo === 'ativo' ? 'item' : campo}`,
                motivo,
              ]),
            ),
          );
        }
        movimentoId = estoque.movimentos.at(-1)?.id ?? null;
      }
      feitas.push({
        item,
        entrega: {
          origem: entrega.origem,
          localId: entrega.origem === 'estoque' ? entrega.local : null,
          movimentoId,
          fornecedorId: entrega.origem === 'fornecedor' ? entrega.fornecedor : null,
          entregueEm: new Date().toISOString(),
        },
      });
      if (entrega.consumivel) item.consumivelId = entrega.consumivel;
    }
    for (const { item, entrega } of feitas) item.entrega = entrega;
    encerrar(
      s,
      s.itens.every(({ entrega }) => entrega !== null) ? 'concluida' : 'aguardando-entrega',
    );
    return ok(comoSolicitacao(s));
  }

  function lote(corpo: Corpo): Resposta {
    const numeros = [...((corpo.numeros as number[] | undefined) ?? [])].sort((a, b) => a - b);
    const nova = corpo.situacao as SituacaoDeDestino;
    let mudaram = 0;
    const recusadas: { numero: number; recusa: RecusaDaSituacao }[] = [];
    for (const numero of numeros) {
      const s = solicitacoes.find((outra) => outra.numero === numero);
      const motivo: RecusaDaSituacao | null = s
        ? recusaDaSituacao({
            tipo: s.dados.tipo,
            atual: s.situacao,
            nova,
            noLote: true,
            comFornecedor: s.fornecedorId !== null,
          })
        : { motivo: 'nao-encontrada' };
      if (motivo || !s) {
        recusadas.push({ numero, recusa: motivo ?? { motivo: 'nao-encontrada' } });
        continue;
      }
      if (nova === 'cancelada') s.motivoDoCancelamento = (corpo.motivo as string) ?? null;
      encerrar(s, nova);
      mudaram += 1;
    }
    return ok({
      mudaram,
      recusadas: recusadas.map(({ numero }) => ({ numero, mensagem: `A ${numero} não mudou.` })),
      texto: textoDoLote({ mudaram, recusadas }),
    });
  }

  function responder(metodo: string, caminho: string, busca: URLSearchParams, corpo: Corpo) {
    if (metodo === 'GET' && caminho === '/solicitacoes') return listar(busca);
    if (metodo === 'POST' && caminho === '/solicitacoes') return registrar(corpo);
    if (metodo === 'POST' && caminho === '/solicitacoes/situacao') return lote(corpo);
    if (metodo === 'GET' && caminho === '/solicitacoes/impressoras') {
      const palavras = normalizarTexto(busca.get('busca') ?? '')
        .split(' ')
        .filter(Boolean);
      return ok({
        itens: ativos
          .filter((ativo) => ativo.situacao === 'ativo' && usaConsumiveis(ativo))
          .filter((ativo) =>
            palavras.every((palavra) =>
              normalizarTexto(`${rotuloDe(ativo)} ${patrimonioDe(ativo) ?? ''}`).includes(palavra),
            ),
          )
          .map((ativo) => ({
            id: ativo.id,
            rotulo: rotuloDe(ativo),
            patrimonio: patrimonioDe(ativo),
            local: local(localDoAtivo(ativo)),
          })),
      });
    }
    const daImpressora = /^\/solicitacoes\/impressoras\/([^/]+)$/.exec(caminho);
    if (metodo === 'GET' && daImpressora) {
      const ativo = ativoDe(daImpressora[1] ?? null);
      if (!ativo) return problema(404, 'nao-encontrado', 'Impressora não encontrada.');
      if (!usaConsumiveis(ativo)) {
        return problema(
          409,
          'conflito',
          `${patrimonioDe(ativo) ?? rotuloDe(ativo)} não usa consumíveis.`,
        );
      }
      return ok({
        ativo: referenciaDoAtivo(ativo),
        local: local(localDoAtivo(ativo)),
        contador: null,
        cores: CORES_DE_CONSUMIVEL.map((cor) => {
          const compativeis = compativeisDaCor(ativo, cor);
          return {
            cor,
            sugerido: sugestaoDoConsumivel(
              compativeis.map((compativel) => ({ ...compativel, ativo: true })),
              cor,
            ),
            compativeis: compativeis.map(({ id, codigo, nome, saldo }) => ({
              id,
              codigo,
              nome,
              saldo,
            })),
          };
        }),
      });
    }
    const doAtivo = /^\/ativos\/([^/]+)\/solicitacoes$/.exec(caminho);
    if (metodo === 'GET' && doAtivo) {
      const id = doAtivo[1] ?? '';
      const ativo = ativoDe(id);
      const doAtivoAqui = [...solicitacoes]
        .reverse()
        .filter((s) =>
          s.dados.tipo === 'toner'
            ? s.dados.impressoras.includes(id)
            : s.dados.tipo === 'conserto' && s.dados.ativo === id,
        );
      return ok({
        pendentes: doAtivoAqui.filter(pendente).map(comoSolicitacao),
        encerradas: doAtivoAqui
          .filter((s) => !pendente(s))
          .slice(0, 5)
          .map(comoSolicitacao),
        usaConsumiveis: ativo ? usaConsumiveis(ativo) : false,
      });
    }
    const daSolicitacao = /^\/solicitacoes\/(\d+)(?:\/([a-z]+))?$/.exec(caminho);
    const s = daSolicitacao
      ? solicitacoes.find((outra) => outra.numero === Number(daSolicitacao[1]))
      : undefined;
    if (daSolicitacao && !s) {
      return problema(404, 'nao-encontrado', 'Solicitação não encontrada.');
    }
    if (s && daSolicitacao) {
      const acao = daSolicitacao[2];
      if (metodo === 'GET' && !acao) return ok(comoSolicitacao(s));
      if (metodo === 'POST' && !pendente(s)) {
        return problema(409, 'conflito', `A solicitação ${s.numero} já está encerrada.`);
      }
      if (metodo === 'POST' && acao === 'pedido') {
        const fornecedor = (corpo.fornecedor as string | null | undefined) ?? null;
        const os = (corpo.os as string | null | undefined) ?? null;
        const erros = validarPedidoAoFornecedor({ fornecedor, os });
        if (Object.keys(erros).length > 0) return recusa(400, erros as Record<string, string>);
        s.fornecedorId = fornecedor;
        s.osDoFornecedor = os;
        s.situacao = 'aguardando-entrega';
        return ok(comoSolicitacao(s));
      }
      if (metodo === 'POST' && acao === 'entrega') return entregar(s, corpo);
      if (metodo === 'POST' && acao === 'conclusao') {
        s.oQueFoiFeito = (corpo.oQueFoiFeito as string | null | undefined) ?? null;
        encerrar(s, 'concluida');
        return ok(comoSolicitacao(s));
      }
      if (metodo === 'POST' && acao === 'cancelamento') {
        const motivo = (corpo.motivo as string | null | undefined) ?? null;
        const erro = validarCancelamento(motivo);
        if (erro) return recusa(400, { motivo: erro });
        s.motivoDoCancelamento = motivo;
        encerrar(s, 'cancelada');
        return ok(comoSolicitacao(s));
      }
      if (metodo === 'POST' && acao === 'situacao') {
        s.situacao = corpo.situacao as SituacaoDaSolicitacao;
        return ok(comoSolicitacao(s));
      }
    }
    return problema(501, 'nao-simulado', `${metodo} ${caminho} não é simulado.`);
  }

  for (const corpo of semeadas) {
    const semeada = registrar(corpo);
    if (semeada.status !== 201)
      throw new Error(`A solicitação semeada foi recusada: ${JSON.stringify(semeada.json)}`);
  }

  await pagina.route(
    (url) => url.pathname.startsWith('/api/'),
    async (rota) => {
      const pedido = rota.request();
      const url = new URL(pedido.url());
      const caminho = url.pathname.slice('/api'.length);
      if (!DAS_SOLICITACOES.test(caminho)) return rota.fallback();
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
    /** A solicitação guardada pelo número, como a API a lê. */
    solicitacao: (numero: number) => {
      const s = solicitacoes.find((outra) => outra.numero === numero);
      return s ? comoSolicitacao(s) : undefined;
    },
    /**
     * A ponte com as OS simuladas (change p4e-ordens-de-servico): a guardada pelo número e pelo
     * id, que a abertura da OS e o fim dela mudam, e a OS que cada uma segue.
     */
    paraAsOrdens: {
      peloNumero: (numero: number) => solicitacoes.find((outra) => outra.numero === numero),
      peloId: (id: string | null) => solicitacoes.find((outra) => outra.id === id),
      pendente,
      encerrar,
      seguir: (ordemDa: (id: string) => Solicitacao['ordem']) => {
        ordemDaSolicitacao = ordemDa;
      },
    },
  };
}
