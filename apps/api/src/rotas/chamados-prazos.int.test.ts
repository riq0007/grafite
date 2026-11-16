// A lista dos prazos (spec chamados, "Prazo do chamado"; spec modulo-chamados, "Prazos"; change
// chamados-da-ti, tarefa 4.10): os chamados abertos que a conta vê, pelo vencimento, com o empate
// pelo número, os grupos no dia do fuso de quem olha e o que a lista e o painel mostram. O prazo
// estragado vai para o fim, sem relógio, e não derruba a lista.
import {
  chamados,
  horarioDaTi,
  mensagensDosChamados,
  naOrganizacao,
  tiposDeChamado,
} from '@grafite/db';
import { type HorarioDaTi, type PrazoDoTipo, prazoEmMinutos } from '@grafite/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarAtivoDoTipo, criarModelo, criarTipo, desligarModulos } from '../../test/alertas.ts';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarLocal,
  criarOrganizacao,
  criarPerfil,
  criarPessoa,
  criarRelogio,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';
import { criarTiposDeFabrica } from '../chamados/fabrica.ts';

const host = 'grafite.chamados-prazos.local';
const ATOR = { tipo: 'sistema', descricao: 'teste da lista dos prazos' } as const;
/** A sexta-feira, 2 de outubro de 2026, às 11:00 em São Paulo. */
const AGORA = new Date('2026-10-02T14:00:00.000Z');
const SAO_PAULO = 'America/Sao_Paulo';
/** O horário da TI gravado: o de fábrica, com a carga cheia de 4 chamados. */
const HORARIO: HorarioDaTi = {
  dias: [1, 2, 3, 4, 5],
  inicio: 480,
  fim: 1080,
  fuso: SAO_PAULO,
  cargaCheia: 4,
};

let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
const contasDe: Record<string, string> = {};
const ids: Record<string, string> = {};
const chamadoDe: Record<number, string> = {};

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const conta = (usuario: string) => contasDe[usuario] ?? '';
const id = (chave: string) => ids[chave] ?? '';
const iso = (momento: string) => new Date(momento).toISOString();

const prazos = (usuario: string, consulta = `fuso=${SAO_PAULO}`) =>
  cliente.consultar(`/chamados/prazos?${consulta}`, como(usuario));

/** O prazo do tipo copiado em minutos, com a primeira resposta de 1 h. */
const prazo = (modo: PrazoDoTipo['modo'], resolucao: PrazoDoTipo['resolucao']) =>
  prazoEmMinutos({ modo, resposta: { valor: 1, unidade: 'h' }, resolucao }, HORARIO);
const oitoHorasCorridas = prazo('corridas', { valor: 8, unidade: 'h' });

interface ChamadoDosPrazos {
  numero: number;
  tipo?: 'outro' | 'rede' | 'impressora';
  titulo?: string;
  pessoa: 'marina' | 'sandra' | 'pedro';
  /** Os locais do chamado; nenhum é o sem local. */
  locais: string[];
  situacao: 'triagem' | 'em-atendimento' | 'aguardando' | 'resolvido';
  /** Quem atende, ou quem resolveu. */
  com?: string;
  abertoEm: string;
  /** O prazo como o banco o guarda, que pode vir estragado. */
  prazo: object;
  /** Os segundos contados até a última parada. */
  contadoS?: number;
  ativo?: string;
}

/** Os chamados gravados direto, com o relógio contando desde a abertura nos que contam. */
const incluirChamados = (lista: ChamadoDosPrazos[]) =>
  naOrganizacao(api.banco, org, async (tx) => {
    const gravados = await tx
      .insert(chamados)
      .values(
        lista.map((chamado) => {
          const abertoEm = new Date(chamado.abertoEm);
          const contando = chamado.situacao === 'triagem' || chamado.situacao === 'em-atendimento';
          const resolvido = chamado.situacao === 'resolvido';
          const titulo = chamado.titulo ?? `Chamado ${chamado.numero}`;
          return {
            orgId: org,
            numero: chamado.numero,
            tipoId: id(chamado.tipo ?? 'outro'),
            titulo,
            tituloNormalizado: titulo.toLowerCase(),
            pessoaId: id(chamado.pessoa),
            origem: 'ti' as const,
            abertoPor: conta('ana'),
            abertoEm,
            formulario: {},
            ativoId: chamado.ativo ? id(chamado.ativo) : null,
            locais: chamado.locais.map(id),
            semLocal: chamado.locais.length === 0,
            situacao: chamado.situacao,
            responsavelId: chamado.com && !resolvido ? conta(chamado.com) : null,
            responsavelDesde: chamado.com && !resolvido ? abertoEm : null,
            prazo: { ...chamado.prazo },
            contadoS: chamado.contadoS ?? 0,
            relogioDesde: contando ? abertoEm : null,
            primeiraRespostaEm: abertoEm,
            resolvidoEm: resolvido ? AGORA : null,
            resolvidoPor: resolvido && chamado.com ? conta(chamado.com) : null,
          };
        }),
      )
      .returning({ id: chamados.id, numero: chamados.numero });
    for (const { id: chamadoId, numero } of gravados) chamadoDe[numero] = chamadoId;
  });

interface EntradaDaConversa {
  numero: number;
  especie: 'mensagem' | 'nota' | 'evento';
  /** A conta de quem escreveu, pelo usuário, ou a pessoa que pediu, pela chave. */
  conta?: string;
  pessoa?: string;
  texto?: string;
  em: string;
}

const incluirConversa = (lista: EntradaDaConversa[]) =>
  naOrganizacao(api.banco, org, (tx) =>
    tx.insert(mensagensDosChamados).values(
      lista.map((entrada) => ({
        orgId: org,
        chamadoId: chamadoDe[entrada.numero] ?? '',
        especie: entrada.especie,
        autorConta: entrada.conta ? conta(entrada.conta) : null,
        autorPessoa: entrada.pessoa ? id(entrada.pessoa) : null,
        texto: entrada.especie === 'evento' ? null : (entrada.texto ?? ''),
        evento: entrada.especie === 'evento' ? 'assumiu' : null,
        criadaEm: new Date(entrada.em),
      })),
    ),
  );

const numeros = (corpo: { chamados: { numero: number }[] }) =>
  corpo.chamados.map((chamado) => chamado.numero);
const grupos = (corpo: { chamados: { numero: number; grupo: string | null }[] }) =>
  Object.fromEntries(corpo.chamados.map((chamado) => [chamado.numero, chamado.grupo]));

/** As mensagens de 300 e de 280 caracteres fora do plano básico, de 2 unidades do UTF-16 cada. */
const MENSAGEM_COMPRIDA = '📄'.repeat(300);
const MENSAGEM_NO_LIMITE = '📄'.repeat(280);

beforeAll(async () => {
  api = await abrirApi({ relogio: criarRelogio(AGORA) });
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  await naOrganizacao(api.banco, org, (tx) =>
    criarTiposDeFabrica(tx, { ator: ATOR, momento: api.relogio.agora() }),
  );
  const tipos = await naOrganizacao(api.banco, org, (tx) =>
    tx.select({ id: tiposDeChamado.id, nome: tiposDeChamado.nome }).from(tiposDeChamado),
  );
  const tipo = (nome: string) => tipos.find((linha) => linha.nome === nome)?.id ?? '';
  ids.outro = tipo('Outro');
  ids.rede = tipo('Rede e internet');
  ids.impressora = tipo('Impressora');

  // Jundiaí, com o Financeiro dentro; Campinas, com o Administrativo e a Sala de TI dentro.
  ids.jundiai = await criarLocal(api, org, { nome: 'Jundiaí', tipo: 'unidade' });
  ids.financeiro = await criarLocal(api, org, { nome: 'Financeiro', paiId: id('jundiai') });
  ids.campinas = await criarLocal(api, org, { nome: 'Campinas', tipo: 'unidade' });
  ids.administrativo = await criarLocal(api, org, {
    nome: 'Administrativo',
    paiId: id('campinas'),
  });
  ids.salaDeTi = await criarLocal(api, org, { nome: 'Sala de TI', paiId: id('campinas') });
  ids.marina = await criarPessoa(api, org, { nome: 'Marina Lopes', localId: id('financeiro') });
  ids.sandra = await criarPessoa(api, org, {
    nome: 'Sandra Vieira',
    localId: id('administrativo'),
  });
  ids.pedro = await criarPessoa(api, org, { nome: 'Pedro Alves' });

  // O switch tem nome; a impressora fica com o rótulo do modelo.
  const switches = await criarTipo(api, org, { nome: 'Switch' });
  const impressoras = await criarTipo(api, org, { nome: 'Impressora' });
  const laserjet = await criarModelo(api, org, {
    tipoId: impressoras,
    fabricante: 'HP',
    nome: 'LaserJet M404',
  });
  ids.switch = await criarAtivoDoTipo(api, org, {
    tipoId: switches,
    nome: 'Switch Rack 2',
    patrimonio: 'PAT-00140',
    localId: id('salaDeTi'),
  });
  ids.laserjet = await criarAtivoDoTipo(api, org, {
    tipoId: impressoras,
    modeloId: laserjet,
    patrimonio: 'PAT-00230',
    localId: id('financeiro'),
  });

  await naOrganizacao(api.banco, org, (tx) =>
    tx.insert(horarioDaTi).values({ orgId: org, ...HORARIO, dias: [...HORARIO.dias] }),
  );

  // Ana e Diego atendem a organização inteira; Bruno, Campinas. Lívia só configura.
  cliente = clienteDaApi(api, host);
  const atendeOsChamados = await criarPerfil(api, org, {
    nome: 'Atende os chamados',
    permissoes: ['chamados.atender'],
  });
  const configura = await criarPerfil(api, org, {
    nome: 'Configura os chamados',
    permissoes: ['chamados.configurar'],
  });
  const nomes = {
    ana: 'Ana Souza',
    bruno: 'Bruno Costa',
    diego: 'Diego Ramos',
    livia: 'Lívia Prates',
  } as const;
  for (const [usuario, nome] of Object.entries(nomes)) {
    contasDe[usuario] = (await criarConta(api, org, { usuario, nome })).id;
  }
  await atribuir(api, org, { perfilId: atendeOsChamados, contaId: conta('ana') });
  await atribuir(api, org, { perfilId: atendeOsChamados, contaId: conta('diego') });
  await atribuir(api, org, {
    perfilId: atendeOsChamados,
    contaId: conta('bruno'),
    localId: id('campinas'),
  });
  await atribuir(api, org, { perfilId: configura, contaId: conta('livia') });
  for (const usuario of ['ana', 'bruno', 'livia']) {
    entradas[usuario] = await cliente.entrar(usuario);
  }

  // Fora da ordem do número, para a ordem da lista não vir da gravação.
  await incluirChamados([
    // Estourados: o #1030 venceu à meia-noite (UTC) e o #1033, às 12:20.
    {
      numero: 1033,
      tipo: 'rede',
      titulo: 'Switch Rack 2 sem link na porta 3',
      pessoa: 'sandra',
      locais: ['administrativo', 'salaDeTi'],
      situacao: 'em-atendimento',
      com: 'diego',
      abertoEm: '2026-10-02T04:20:00Z',
      prazo: oitoHorasCorridas,
      ativo: 'switch',
    },
    {
      numero: 1030,
      pessoa: 'marina',
      locais: ['financeiro'],
      situacao: 'em-atendimento',
      com: 'diego',
      abertoEm: '2026-10-01T20:00:00Z',
      prazo: prazo('corridas', { valor: 4, unidade: 'h' }),
    },
    // Em até 2 horas: o #1037 às 15:30 e os #1035 e #1036 às 15:50, com o empate pelo número.
    {
      numero: 1036,
      pessoa: 'marina',
      locais: ['financeiro'],
      situacao: 'triagem',
      abertoEm: '2026-10-02T07:50:00Z',
      prazo: oitoHorasCorridas,
    },
    {
      numero: 1037,
      pessoa: 'sandra',
      locais: ['administrativo'],
      situacao: 'triagem',
      abertoEm: '2026-10-02T07:30:00Z',
      prazo: oitoHorasCorridas,
    },
    {
      numero: 1035,
      pessoa: 'sandra',
      locais: ['administrativo'],
      situacao: 'triagem',
      abertoEm: '2026-10-02T07:50:00Z',
      prazo: oitoHorasCorridas,
    },
    // Hoje, em São Paulo: o #1042, sem local, às 18:00; o #1038, no horário da TI, às 19:00 (16:00
    // lá); e o #1040, à 01:30 de sábado em UTC, que lá ainda são 22:30 de sexta.
    {
      numero: 1040,
      pessoa: 'marina',
      locais: ['financeiro'],
      situacao: 'em-atendimento',
      com: 'ana',
      abertoEm: '2026-10-02T13:30:00Z',
      prazo: prazo('corridas', { valor: 12, unidade: 'h' }),
    },
    {
      numero: 1038,
      tipo: 'impressora',
      titulo: 'Impressora manchando',
      pessoa: 'marina',
      locais: ['financeiro'],
      situacao: 'em-atendimento',
      com: 'ana',
      abertoEm: '2026-10-02T11:00:00Z',
      prazo: prazo('horario', { valor: 8, unidade: 'h' }),
      ativo: 'laserjet',
    },
    {
      numero: 1042,
      pessoa: 'pedro',
      locais: [],
      situacao: 'triagem',
      abertoEm: '2026-10-02T10:00:00Z',
      prazo: oitoHorasCorridas,
    },
    // Depois de hoje: o #1046, de Jundiaí e de Campinas, no sábado, e o #1041, na terça.
    {
      numero: 1041,
      pessoa: 'marina',
      locais: ['financeiro'],
      situacao: 'em-atendimento',
      com: 'diego',
      abertoEm: '2026-10-02T11:00:00Z',
      prazo: prazo('horario', { valor: 3, unidade: 'd' }),
    },
    {
      numero: 1046,
      pessoa: 'marina',
      locais: ['financeiro', 'administrativo'],
      situacao: 'em-atendimento',
      com: 'ana',
      abertoEm: '2026-10-02T12:00:00Z',
      prazo: prazo('corridas', { valor: 24, unidade: 'h' }),
    },
    // Parados: o #1043 ainda tem 5 h; o #1044 passou 1 h do prazo, e vem antes.
    {
      numero: 1043,
      pessoa: 'sandra',
      locais: ['administrativo'],
      situacao: 'aguardando',
      com: 'bruno',
      abertoEm: '2026-10-01T12:00:00Z',
      prazo: oitoHorasCorridas,
      contadoS: 3 * 3600,
    },
    {
      numero: 1044,
      pessoa: 'marina',
      locais: ['financeiro'],
      situacao: 'aguardando',
      com: 'diego',
      abertoEm: '2026-10-01T12:00:00Z',
      prazo: oitoHorasCorridas,
      contadoS: 9 * 3600,
    },
    // O prazo estragado: os minutos zerados e o modo que não existe.
    {
      numero: 1039,
      pessoa: 'sandra',
      locais: ['administrativo'],
      situacao: 'triagem',
      abertoEm: '2026-10-02T09:00:00Z',
      prazo: { ...oitoHorasCorridas, modo: 'semana' },
    },
    {
      numero: 1031,
      pessoa: 'marina',
      locais: ['financeiro'],
      situacao: 'em-atendimento',
      com: 'diego',
      abertoEm: '2026-10-02T09:00:00Z',
      prazo: { ...oitoHorasCorridas, resolucaoMin: 0 },
    },
    // O resolvido não entra.
    {
      numero: 1032,
      pessoa: 'sandra',
      locais: ['administrativo'],
      situacao: 'resolvido',
      com: 'bruno',
      abertoEm: '2026-10-02T08:00:00Z',
      prazo: oitoHorasCorridas,
    },
  ]);

  await incluirConversa([
    // No #1033, a última mensagem é a de Sandra; a nota e o evento depois dela não contam.
    {
      numero: 1033,
      especie: 'mensagem',
      pessoa: 'sandra',
      texto: 'A sala está sem rede.',
      em: '2026-10-02T12:00:00Z',
    },
    {
      numero: 1033,
      especie: 'mensagem',
      conta: 'diego',
      texto: 'Estou olhando o switch.',
      em: '2026-10-02T12:10:00Z',
    },
    {
      numero: 1033,
      especie: 'mensagem',
      pessoa: 'sandra',
      texto: 'A sala do Administrativo continua sem rede. Dá para olhar agora?',
      em: '2026-10-02T12:12:00Z',
    },
    {
      numero: 1033,
      especie: 'nota',
      conta: 'diego',
      texto: 'A porta 3 está queimada.',
      em: '2026-10-02T12:30:00Z',
    },
    { numero: 1033, especie: 'evento', conta: 'diego', em: '2026-10-02T12:40:00Z' },
    // No #1041, a última é de quem atende.
    {
      numero: 1041,
      especie: 'mensagem',
      pessoa: 'marina',
      texto: 'O cabo de rede da minha mesa soltou.',
      em: '2026-10-02T11:00:00Z',
    },
    {
      numero: 1041,
      especie: 'mensagem',
      conta: 'diego',
      texto: 'Troco o cabo amanhã cedo.',
      em: '2026-10-02T13:00:00Z',
    },
    // No #1038, a mensagem comprida.
    {
      numero: 1038,
      especie: 'mensagem',
      pessoa: 'marina',
      texto: MENSAGEM_COMPRIDA,
      em: '2026-10-02T11:05:00Z',
    },
    // No #1035, a mensagem de 280 caracteres, que vai inteira.
    {
      numero: 1035,
      especie: 'mensagem',
      pessoa: 'sandra',
      texto: MENSAGEM_NO_LIMITE,
      em: '2026-10-02T08:00:00Z',
    },
    // No #1037, as duas no mesmo instante: vale a gravada depois.
    {
      numero: 1037,
      especie: 'mensagem',
      pessoa: 'sandra',
      texto: 'A impressora parou.',
      em: '2026-10-02T08:00:00Z',
    },
    {
      numero: 1037,
      especie: 'mensagem',
      pessoa: 'sandra',
      texto: 'Voltou a imprimir, mas manchando.',
      em: '2026-10-02T08:00:00Z',
    },
    // No #1046, só a nota e o evento.
    {
      numero: 1046,
      especie: 'nota',
      conta: 'ana',
      texto: 'Ver com o Financeiro.',
      em: '2026-10-02T12:05:00Z',
    },
    { numero: 1046, especie: 'evento', conta: 'ana', em: '2026-10-02T12:06:00Z' },
  ]);
});

describe('a lista dos prazos', () => {
  it('quem vê a organização inteira: os abertos pelo vencimento, nos grupos, e os estragados no fim', async () => {
    const r = await prazos('ana');
    expect(r.statusCode, r.body).toBe(200);
    const corpo = r.json();
    expect(corpo.horario).toEqual(HORARIO);
    expect(numeros(corpo)).toEqual([
      1030, 1033, 1037, 1035, 1036, 1042, 1038, 1040, 1046, 1041, 1044, 1043, 1031, 1039,
    ]);
    expect(grupos(corpo)).toEqual({
      1030: 'estourado',
      1033: 'estourado',
      1037: 'ate-2-horas',
      1035: 'ate-2-horas',
      1036: 'ate-2-horas',
      1042: 'hoje',
      1038: 'hoje',
      1040: 'hoje',
      1046: 'depois-de-hoje',
      1041: 'depois-de-hoje',
      1044: 'parado',
      1043: 'parado',
      1031: null,
      1039: null,
    });
  });

  it('cada chamado leva o que a lista e o painel mostram', async () => {
    const corpo = (await prazos('ana')).json();
    const doNumero = (numero: number) =>
      corpo.chamados.find((chamado: { numero: number }) => chamado.numero === numero);
    expect(doNumero(1033)).toEqual({
      numero: 1033,
      titulo: 'Switch Rack 2 sem link na porta 3',
      situacao: 'em-atendimento',
      versao: 1,
      abertoEm: iso('2026-10-02T04:20:00Z'),
      tipo: { id: id('rede'), nome: 'Rede e internet', icone: 'globo' },
      pessoa: { id: id('sandra'), nome: 'Sandra Vieira', local: 'Campinas › Administrativo' },
      responsavel: { conta: conta('diego'), nome: 'Diego Ramos' },
      ativo: {
        id: id('switch'),
        rotulo: 'Switch Rack 2',
        patrimonio: 'PAT-00140',
        local: 'Campinas › Sala de TI',
      },
      locais: [id('administrativo'), id('salaDeTi')],
      semLocal: false,
      relogio: {
        prazo: oitoHorasCorridas,
        contadoS: 0,
        relogioDesde: iso('2026-10-02T04:20:00Z'),
        primeiraRespostaEm: iso('2026-10-02T04:20:00Z'),
      },
      grupo: 'estourado',
      ultimaMensagem: {
        autor: 'Sandra Vieira',
        em: iso('2026-10-02T12:12:00Z'),
        texto: 'A sala do Administrativo continua sem rede. Dá para olhar agora?',
      },
    });
    // O ativo sem nome vai com o rótulo do modelo, e a mensagem comprida, cortada em 280
    // caracteres, sem partir nenhum.
    expect(doNumero(1038)).toMatchObject({
      tipo: { id: id('impressora'), nome: 'Impressora', icone: 'impressora' },
      pessoa: { id: id('marina'), nome: 'Marina Lopes', local: 'Jundiaí › Financeiro' },
      responsavel: { conta: conta('ana'), nome: 'Ana Souza' },
      ativo: {
        id: id('laserjet'),
        rotulo: 'HP LaserJet M404',
        patrimonio: 'PAT-00230',
        local: 'Jundiaí › Financeiro',
      },
      ultimaMensagem: {
        autor: 'Marina Lopes',
        em: iso('2026-10-02T11:05:00Z'),
        texto: `${'📄'.repeat(279)}…`,
      },
    });
    // A de 280 caracteres vai inteira; das duas no mesmo instante, vai a gravada depois.
    expect(doNumero(1035).ultimaMensagem.texto).toBe(MENSAGEM_NO_LIMITE);
    expect(doNumero(1037).ultimaMensagem.texto).toBe('Voltou a imprimir, mas manchando.');
    // A última mensagem de quem atende vai com o nome da conta.
    expect(doNumero(1041).ultimaMensagem).toEqual({
      autor: 'Diego Ramos',
      em: iso('2026-10-02T13:00:00Z'),
      texto: 'Troco o cabo amanhã cedo.',
    });
    // Sem local, sem quem atende, sem ativo e sem mensagem; e a conversa só com a nota e o evento.
    expect(doNumero(1042)).toMatchObject({
      situacao: 'triagem',
      tipo: { id: id('outro'), nome: 'Outro', icone: 'reticencias' },
      pessoa: { id: id('pedro'), nome: 'Pedro Alves', local: null },
      responsavel: null,
      ativo: null,
      locais: [],
      semLocal: true,
      ultimaMensagem: null,
    });
    expect(doNumero(1046).ultimaMensagem).toBeNull();
    // O parado leva o contado até a parada, sem o momento em que voltou a contar.
    expect(doNumero(1044).relogio).toEqual({
      prazo: oitoHorasCorridas,
      contadoS: 9 * 3600,
      relogioDesde: null,
      primeiraRespostaEm: iso('2026-10-01T12:00:00Z'),
    });
    // O prazo estragado vai sem relógio e sem grupo, com o resto do chamado.
    expect(doNumero(1031)).toMatchObject({
      titulo: 'Chamado 1031',
      responsavel: { conta: conta('diego'), nome: 'Diego Ramos' },
      relogio: null,
      grupo: null,
    });
  });

  it('quem atende um local só vê os chamados dele, também os de mais de um local', async () => {
    const r = await prazos('bruno');
    expect(r.statusCode, r.body).toBe(200);
    expect(numeros(r.json())).toEqual([1033, 1037, 1035, 1046, 1043, 1039]);
  });

  it('o grupo de hoje é o do fuso de quem olha', async () => {
    // Em UTC, o #1040 vence no sábado; a ordem continua a do vencimento.
    const emUtc = (await prazos('ana', 'fuso=UTC')).json();
    expect(numeros(emUtc)).toEqual([
      1030, 1033, 1037, 1035, 1036, 1042, 1038, 1040, 1046, 1041, 1044, 1043, 1031, 1039,
    ]);
    expect(grupos(emUtc)).toMatchObject({ 1042: 'hoje', 1038: 'hoje', 1040: 'depois-de-hoje' });
    // O fuso escrito em outra caixa é o mesmo fuso.
    const emOutraCaixa = await prazos('ana', 'fuso=america/sao_paulo');
    expect(emOutraCaixa.statusCode, emOutraCaixa.body).toBe(200);
    expect(emOutraCaixa.json()).toEqual((await prazos('ana')).json());
  });
});

describe('as recusas da lista dos prazos', () => {
  it('o fuso que falta e o desconhecido', async () => {
    const semFuso = await prazos('ana', '');
    expect(semFuso.statusCode).toBe(400);
    expect(semFuso.json()).toMatchObject({
      type: 'urn:grafite:problema:dados-invalidos',
      campos: { fuso: 'Fuso horário desconhecido.' },
    });
    const desconhecido = await prazos('ana', 'fuso=America/Jundiai');
    expect(desconhecido.statusCode).toBe(400);
    expect(desconhecido.json()).toMatchObject({ campos: { fuso: 'Fuso horário desconhecido.' } });
  });

  it('quem não vê os chamados não lê a lista', async () => {
    const r = await prazos('livia');
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:sem-permissao' });
  });

  it('com o módulo desligado, a lista responde que ele está desligado', async () => {
    await desligarModulos(api, org, ['chamados']);
    const r = await prazos('ana');
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ type: 'urn:grafite:problema:modulo-desligado' });
  });
});
