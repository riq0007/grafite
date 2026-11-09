// A API do estoque simulada, para as pontas a ponta do Operação (specs estoque e modulo-operacao;
// change p4c-estoque): os saldos, as movimentações, os consumíveis abaixo do mínimo, os ativos para
// a saída, os lançamentos conferidos pelo domínio, com o saldo que não fica negativo, e o mínimo; as
// referências do estoque nos consumíveis, nos fornecedores e o resumo do ativo para a saída aberta
// pelo endereço. Ela fica sobre a dos ativos e a dos consumíveis, e responde só os caminhos dela. A
// sessão simulada é a da administradora, que vê e movimenta o estoque em todos os locais.
import { randomUUID } from 'node:crypto';
import type { components } from '@grafite/api-client';
import {
  type ArvoreDeLocais,
  abaixoDesdeDepois,
  codigoNormalizado,
  consumivelPrecisaEstarAtivo,
  type DadosDoLancamento,
  efeitoNosSaldos,
  limparLancamento,
  MENSAGEM_DO_CONSUMIVEL_INATIVO,
  mensagemDoSaldo,
  montarArvore,
  normalizarTexto,
  rotuloDoAtivo,
  situacaoDoSaldo,
  type TipoDeMovimento,
  validarLancamento,
  validarMinimo,
} from '@grafite/domain';
import type { Page } from '@playwright/test';
import type { EstadoDoCatalogo } from './api-do-catalogo.ts';
import { type FornecedorGuardado, LOCAIS } from './api-dos-ativos.ts';
import type { ConsumivelGuardado } from './api-dos-consumiveis.ts';

type Saldo = components['schemas']['SaldoDoEstoque'];
type Movimento = components['schemas']['MovimentoDoEstoque'];

/** O saldo de um consumível num local, guardado na simulação. */
export interface SaldoGuardado {
  id: string;
  consumivelId: string;
  localId: string;
  saldo: number;
  minimo: number;
  abaixoDesde: string | null;
}

/** Uma movimentação guardada, com as referências pelo id. */
export interface MovimentoGuardado {
  id: string;
  tipo: TipoDeMovimento;
  consumivelId: string;
  quantidade: number;
  origemId: string | null;
  destinoId: string | null;
  fornecedorId: string | null;
  notaFiscal: string | null;
  ativoId: string | null;
  motivo: Movimento['motivo'];
  observacao: string | null;
  momento: string;
}

/** O ativo como a simulação dos ativos o guarda: o que o estoque lê dele. */
interface AtivoDaSimulacao {
  id: string;
  tipoId: string;
  modeloId: string | null;
  valores: Record<string, unknown>;
  situacao: 'ativo' | 'inativo';
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
    codigoDeRastreio: 'T5EX-2E2E',
    ...(campos && { campos }),
  },
});

/** Os caminhos, depois do /api, que esta API responde; os outros passam adiante. */
const DO_ESTOQUE =
  /^\/estoque\/|^\/consumiveis\/escolha$|^\/consumiveis\/[^/]+\/estoque$|^\/fornecedores\/[^/]+\/(consumiveis|entradas)$|^\/ativos\/[^/]+\/resumo$/;

const LANCAMENTOS: Record<string, TipoDeMovimento> = {
  entradas: 'entrada',
  saidas: 'saida',
  transferencias: 'transferencia',
  ajustes: 'ajuste',
};

/** A conta da sessão simulada, que lança. */
const QUEM_LANCA = { id: '0199a6e0-0000-7000-8000-0000000000c1', nome: 'Ana Souza' };

export async function simularEstoque(
  pagina: Page,
  {
    catalogo,
    fornecedores,
    ativos,
    consumiveis,
  }: {
    catalogo: EstadoDoCatalogo;
    fornecedores: FornecedorGuardado[];
    ativos: AtivoDaSimulacao[];
    consumiveis: ConsumivelGuardado[];
  },
  iniciais: { saldos?: SaldoGuardado[]; movimentos?: MovimentoGuardado[] } = {},
) {
  const saldos: SaldoGuardado[] = (iniciais.saldos ?? []).map((saldo) => ({ ...saldo }));
  const movimentos: MovimentoGuardado[] = (iniciais.movimentos ?? []).map((m) => ({ ...m }));
  const pedidos: { metodo: string; caminho: string; corpo: Corpo }[] = [];
  const arvore: ArvoreDeLocais = montarArvore(LOCAIS);

  const consumivelDe = (id: string | null) => consumiveis.find((outro) => outro.id === id);
  const ativoDe = (id: string | null) => ativos.find((outro) => outro.id === id);

  const referenciaDoConsumivel = (consumivel: ConsumivelGuardado) => ({
    id: consumivel.id,
    codigo: consumivel.codigo,
    nome: consumivel.nome,
    tipo: consumivel.tipo,
    cor: consumivel.cor,
    situacao: consumivel.situacao,
    abrir: true,
  });

  const rotuloDe = (ativo: AtivoDaSimulacao) => {
    const tipo = catalogo.tipos.find((outro) => outro.id === ativo.tipoId);
    const modelo = catalogo.modelos.find((outro) => outro.id === ativo.modeloId);
    return rotuloDoAtivo({
      nome: (ativo.valores['ativo.nome'] as string | undefined) ?? null,
      modelo: modelo ?? null,
      tipo: tipo ?? { nome: '' },
    });
  };
  const patrimonioDe = (ativo: AtivoDaSimulacao) =>
    (ativo.valores['ativo.patrimonio'] as string | undefined) ?? null;

  function comoSaldo(saldo: SaldoGuardado): Saldo | null {
    const consumivel = consumivelDe(saldo.consumivelId);
    if (!consumivel) return null;
    return {
      id: saldo.id,
      consumivel: referenciaDoConsumivel(consumivel),
      local: { id: saldo.localId, caminho: arvore.caminho(saldo.localId) },
      saldo: saldo.saldo,
      minimo: saldo.minimo,
      situacao: situacaoDoSaldo(saldo.saldo, saldo.minimo),
      abaixoDesde: saldo.abaixoDesde,
      permite: { movimentar: true },
    };
  }

  function comoMovimento(movimento: MovimentoGuardado): Movimento | null {
    const consumivel = consumivelDe(movimento.consumivelId);
    if (!consumivel) return null;
    const local = (id: string | null) => (id ? { id, caminho: arvore.caminho(id) } : null);
    const fornecedor = fornecedores.find((outro) => outro.id === movimento.fornecedorId);
    const ativo = ativoDe(movimento.ativoId);
    return {
      id: movimento.id,
      tipo: movimento.tipo,
      consumivel: referenciaDoConsumivel(consumivel),
      quantidade: movimento.quantidade,
      origem: local(movimento.origemId),
      destino: local(movimento.destinoId),
      fornecedor: fornecedor ? { id: fornecedor.id, nome: fornecedor.nome, abrir: true } : null,
      notaFiscal: movimento.notaFiscal,
      ativo: ativo
        ? { id: ativo.id, rotulo: rotuloDe(ativo), patrimonio: patrimonioDe(ativo), abrir: true }
        : null,
      contador: null,
      motivo: movimento.motivo,
      observacao: movimento.observacao,
      lancadoPor: QUEM_LANCA,
      momento: movimento.momento,
    };
  }

  const ordemDosSaldos = (a: Saldo, b: Saldo) =>
    codigoNormalizado(a.consumivel.codigo).localeCompare(codigoNormalizado(b.consumivel.codigo)) ||
    a.local.caminho.localeCompare(b.local.caminho, 'pt-BR');

  const doRamo = (localId: string | null) =>
    localId && arvore.local(localId) ? arvore.ramo(localId) : new Set<string>();

  /** O lançamento conferido pelo domínio e aplicado aos saldos, como a API; ou a recusa. */
  function lancar(tipo: TipoDeMovimento, corpo: Corpo): Resposta {
    const texto = (chave: string) => (corpo[chave] as string | null | undefined) ?? null;
    const comum = {
      consumivel: texto('consumivel'),
      quantidade: (corpo.quantidade as number | null | undefined) ?? null,
      observacao: texto('observacao'),
    };
    const pedido: DadosDoLancamento =
      tipo === 'entrada'
        ? {
            ...comum,
            tipo,
            destino: texto('destino'),
            fornecedor: texto('fornecedor'),
            notaFiscal: texto('notaFiscal'),
          }
        : tipo === 'saida'
          ? { ...comum, tipo, origem: texto('origem'), ativo: texto('ativo') }
          : tipo === 'transferencia'
            ? { ...comum, tipo, origem: texto('origem'), destino: texto('destino') }
            : {
                ...comum,
                tipo,
                local: texto('local'),
                direcao: (corpo.direcao as 'acrescentar' | 'retirar' | null) ?? null,
                motivo: (corpo.motivo as Movimento['motivo']) ?? null,
              };
    const dados = limparLancamento(pedido);
    const erros = validarLancamento(dados);
    if (Object.keys(erros).length > 0) {
      return problema(
        400,
        'dados-invalidos',
        'Confira os campos indicados.',
        erros as Record<string, string>,
      );
    }
    const consumivel = consumivelDe(dados.consumivel);
    if (!consumivel) {
      return problema(400, 'dados-invalidos', 'Confira os campos indicados.', {
        consumivel: 'Consumível não encontrado.',
      });
    }
    if (consumivel.situacao !== 'ativo' && consumivelPrecisaEstarAtivo(dados)) {
      return problema(409, 'conflito', MENSAGEM_DO_CONSUMIVEL_INATIVO, {
        consumivel: MENSAGEM_DO_CONSUMIVEL_INATIVO,
      });
    }
    const momento = new Date().toISOString();
    const efeitos = efeitoNosSaldos(dados);
    // Confere o saldo de onde sai antes de mudar qualquer um, como a transação da API.
    for (const { local, diferenca } of efeitos) {
      if (diferenca >= 0) continue;
      const atual =
        saldos.find((saldo) => saldo.consumivelId === consumivel.id && saldo.localId === local)
          ?.saldo ?? 0;
      if (atual < -diferenca) {
        const mensagem = mensagemDoSaldo(consumivel.codigo, arvore.caminho(local), atual);
        return problema(409, 'conflito', mensagem, { quantidade: mensagem });
      }
    }
    const mudados = efeitos.map(({ local, diferenca }) => {
      let saldo = saldos.find(
        (outro) => outro.consumivelId === consumivel.id && outro.localId === local,
      );
      if (!saldo) {
        saldo = {
          id: randomUUID(),
          consumivelId: consumivel.id,
          localId: local,
          saldo: 0,
          minimo: 0,
          abaixoDesde: null,
        };
        saldos.push(saldo);
      }
      saldo.saldo += diferenca;
      const desde = abaixoDesdeDepois({
        antes: saldo.abaixoDesde ? new Date(saldo.abaixoDesde) : null,
        saldo: saldo.saldo,
        minimo: saldo.minimo,
        momento: new Date(momento),
      });
      saldo.abaixoDesde = desde?.toISOString() ?? null;
      return saldo;
    });
    const movimento: MovimentoGuardado = {
      id: randomUUID(),
      tipo,
      consumivelId: consumivel.id,
      quantidade: dados.quantidade ?? 0,
      origemId: efeitos.find(({ diferenca }) => diferenca < 0)?.local ?? null,
      destinoId: efeitos.find(({ diferenca }) => diferenca > 0)?.local ?? null,
      fornecedorId: dados.tipo === 'entrada' ? dados.fornecedor : null,
      notaFiscal: dados.tipo === 'entrada' ? dados.notaFiscal : null,
      ativoId: dados.tipo === 'saida' ? dados.ativo : null,
      motivo: dados.tipo === 'ajuste' ? dados.motivo : null,
      observacao: dados.observacao,
      momento,
    };
    movimentos.push(movimento);
    return ok({ movimento: comoMovimento(movimento), saldos: mudados.map(comoSaldo) }, 201);
  }

  function responder(metodo: string, caminho: string, busca: URLSearchParams, corpo: Corpo) {
    if (metodo === 'GET' && caminho === '/consumiveis/escolha') {
      const id = busca.get('id');
      const texto = busca.get('busca')?.trim() ?? '';
      const lista = id
        ? consumiveis.filter((consumivel) => consumivel.id === id)
        : consumiveis.filter(
            (consumivel) =>
              consumivel.situacao === 'ativo' &&
              (texto === '' ||
                codigoNormalizado(consumivel.codigo).includes(codigoNormalizado(texto)) ||
                normalizarTexto(consumivel.nome ?? '').includes(normalizarTexto(texto))),
          );
      return ok({
        consumiveis: lista.map(({ id: deles, codigo, nome, tipo, cor }) => ({
          id: deles,
          codigo,
          nome,
          tipo,
          cor,
        })),
      });
    }
    const doConsumivel = /^\/consumiveis\/([^/]+)\/estoque$/.exec(caminho);
    if (metodo === 'GET' && doConsumivel) {
      const id = doConsumivel[1] ?? '';
      const dele = saldos
        .filter((saldo) => saldo.consumivelId === id)
        .map(comoSaldo)
        .filter((saldo): saldo is Saldo => saldo !== null)
        .sort(ordemDosSaldos);
      return ok({
        saldos: dele,
        soma: dele.reduce((soma, { saldo }) => soma + saldo, 0),
        movimentos: movimentos
          .filter((movimento) => movimento.consumivelId === id)
          .reverse()
          .slice(0, 10)
          .map(comoMovimento),
        permite: { movimentar: true },
      });
    }
    const doFornecedor = /^\/fornecedores\/([^/]+)\/(consumiveis|entradas)$/.exec(caminho);
    if (metodo === 'GET' && doFornecedor) {
      const id = doFornecedor[1];
      if (doFornecedor[2] === 'consumiveis') {
        return ok({
          consumiveis: consumiveis
            .filter((consumivel) => consumivel.situacao === 'ativo')
            .filter((consumivel) => consumivel.fornecedores.includes(id ?? ''))
            .map(({ id: deles, codigo, nome, tipo, cor }) => ({
              id: deles,
              codigo,
              nome,
              tipo,
              cor,
            })),
        });
      }
      const entradas = movimentos.filter(
        (movimento) => movimento.tipo === 'entrada' && movimento.fornecedorId === id,
      );
      return ok({ entradas: entradas.length, ultima: entradas.at(-1)?.momento ?? null });
    }
    const doResumo = /^\/ativos\/([^/]+)\/resumo$/.exec(caminho);
    if (metodo === 'GET' && doResumo) {
      const ativo = ativoDe(doResumo[1] ?? null);
      if (!ativo) return problema(404, 'nao-encontrado', 'Ativo não encontrado.');
      return ok({ id: ativo.id, rotulo: rotuloDe(ativo), patrimonio: patrimonioDe(ativo) });
    }
    if (metodo === 'GET' && caminho === '/estoque/saldos') {
      const consumivel = busca.get('consumivel');
      const ramo = busca.get('local') ? doRamo(busca.get('local')) : null;
      const situacao = busca.get('situacao');
      const texto = busca.get('busca')?.trim() ?? '';
      const itens = saldos
        .filter(
          (saldo) =>
            (!consumivel || saldo.consumivelId === consumivel) &&
            (!ramo || ramo.has(saldo.localId)) &&
            (!situacao ||
              (situacao === 'abaixo-do-minimo'
                ? saldo.abaixoDesde !== null
                : situacaoDoSaldo(saldo.saldo, saldo.minimo) === situacao)),
        )
        .map(comoSaldo)
        .filter((saldo): saldo is Saldo => saldo !== null)
        .filter(
          (saldo) =>
            texto === '' ||
            codigoNormalizado(saldo.consumivel.codigo).includes(codigoNormalizado(texto)) ||
            normalizarTexto(saldo.consumivel.nome ?? '').includes(normalizarTexto(texto)),
        )
        .sort(ordemDosSaldos);
      return ok({ itens, total: itens.length, proximo: null, permite: { movimentar: true } });
    }
    if (metodo === 'GET' && caminho === '/estoque/movimentos') {
      const filtro = (chave: string) => busca.get(chave);
      const ramo = filtro('local') ? doRamo(filtro('local')) : null;
      const itens = movimentos
        .filter(
          (movimento) =>
            (!filtro('tipo') || movimento.tipo === filtro('tipo')) &&
            (!filtro('consumivel') || movimento.consumivelId === filtro('consumivel')) &&
            (!filtro('fornecedor') || movimento.fornecedorId === filtro('fornecedor')) &&
            (!filtro('ativo') || movimento.ativoId === filtro('ativo')) &&
            (!ramo || ramo.has(movimento.origemId ?? '') || ramo.has(movimento.destinoId ?? '')),
        )
        .reverse()
        .map(comoMovimento);
      return ok({ itens, total: itens.length, proximo: null });
    }
    if (metodo === 'GET' && caminho === '/estoque/abaixo-do-minimo') {
      return ok({
        itens: saldos
          .filter((saldo) => saldo.abaixoDesde !== null)
          .sort((a, b) => (a.abaixoDesde ?? '').localeCompare(b.abaixoDesde ?? ''))
          .map(comoSaldo)
          .filter(Boolean),
      });
    }
    if (metodo === 'GET' && caminho === '/estoque/ativos-para-saida') {
      const consumivel = consumivelDe(busca.get('consumivel'));
      const texto = normalizarTexto(busca.get('busca') ?? '');
      const lista = ativos
        .filter((ativo) => ativo.situacao === 'ativo')
        .map((ativo) => ({
          id: ativo.id,
          rotulo: rotuloDe(ativo),
          patrimonio: patrimonioDe(ativo),
          local: null,
          sugerido: Boolean(ativo.modeloId && consumivel?.modelos.includes(ativo.modeloId)),
        }))
        .filter(
          (ativo) =>
            texto === '' ||
            normalizarTexto(`${ativo.rotulo} ${ativo.patrimonio ?? ''}`).includes(texto),
        )
        .sort((a, b) => Number(b.sugerido) - Number(a.sugerido));
      return ok({ ativos: lista });
    }
    const doLancamento = /^\/estoque\/(entradas|saidas|transferencias|ajustes)$/.exec(caminho);
    const tipoDoLancamento = doLancamento ? LANCAMENTOS[doLancamento[1] ?? ''] : undefined;
    if (metodo === 'POST' && tipoDoLancamento) return lancar(tipoDoLancamento, corpo);
    const doMinimo = /^\/estoque\/minimos\/([^/]+)\/([^/]+)$/.exec(caminho);
    if (metodo === 'PUT' && doMinimo) {
      const minimo = (corpo.minimo as number | null) ?? null;
      const recusa = validarMinimo(minimo);
      if (recusa !== null || minimo === null) {
        return problema(400, 'dados-invalidos', 'Confira os campos indicados.', {
          minimo: recusa ?? '',
        });
      }
      const [, consumivelId = '', localId = ''] = doMinimo;
      let saldo = saldos.find(
        (outro) => outro.consumivelId === consumivelId && outro.localId === localId,
      );
      if (!saldo) {
        saldo = { id: randomUUID(), consumivelId, localId, saldo: 0, minimo: 0, abaixoDesde: null };
        saldos.push(saldo);
      }
      saldo.minimo = minimo;
      saldo.abaixoDesde =
        abaixoDesdeDepois({
          antes: saldo.abaixoDesde ? new Date(saldo.abaixoDesde) : null,
          saldo: saldo.saldo,
          minimo,
          momento: new Date(),
        })?.toISOString() ?? null;
      return ok(comoSaldo(saldo));
    }
    return problema(501, 'nao-simulado', `${metodo} ${caminho} não é simulado.`);
  }

  await pagina.route(
    (url) => url.pathname.startsWith('/api/'),
    async (rota) => {
      const pedido = rota.request();
      const url = new URL(pedido.url());
      const caminho = url.pathname.slice('/api'.length);
      if (!DO_ESTOQUE.test(caminho)) return rota.fallback();
      const metodo = pedido.method();
      const corpo: Corpo = (metodo !== 'GET' && pedido.postDataJSON()) || {};
      pedidos.push({ metodo, caminho: url.pathname, corpo });
      const resposta = responder(metodo, caminho, url.searchParams, corpo);
      await rota.fulfill({
        status: resposta.status,
        contentType: resposta.status >= 400 ? 'application/problem+json' : 'application/json',
        body: JSON.stringify(resposta.json),
      });
    },
  );

  return {
    saldos,
    movimentos,
    /** O lançamento como a API o faz, para a entrega das solicitações sair do mesmo livro-razão. */
    lancar: (tipo: TipoDeMovimento, corpo: Corpo) => lancar(tipo, corpo),
    /** O saldo somado de um consumível em todos os locais, para o cartão da ficha do ativo. */
    saldoDe: (consumivelId: string) =>
      saldos
        .filter((saldo) => saldo.consumivelId === consumivelId)
        .reduce((soma, { saldo }) => soma + saldo, 0),
    /** Os corpos das escritas no caminho, como "POST /api/estoque/entradas", na ordem. */
    corposDe: (pedidoFeito: string) =>
      pedidos
        .filter(({ metodo, caminho }) => `${metodo} ${caminho}` === pedidoFeito)
        .map(({ corpo }) => corpo),
  };
}
