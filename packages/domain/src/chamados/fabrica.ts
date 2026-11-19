// Os tipos de chamado de fábrica (spec tipos-de-chamado, "Tipos de fábrica"; change chamados-da-ti,
// design, decisão 6): os 9 que toda organização ganha, Em uso e nesta ordem, com o formulário de
// cada um. O `organizacao criar` os grava, e a migration os grava nas organizações que já existiam,
// pelo texto que um gerador tira desta lista. Depois de criados, são como os outros tipos.
import type {
  CampoDoFormulario,
  Formulario,
  OpcaoDoCampo,
  TipoDeCampoDoChamado,
  TituloDoFormulario,
} from './formulario.ts';
import type { PrazoDoTipo, UnidadeDoPrazo } from './prazo.ts';
import type { IconeDoTipoDeChamado, PedidoDoTipoDeChamado } from './tipo.ts';

/** O tipo de fábrica: o pedido da gravação, com o ícone da lista, a frase e o formulário. */
export interface TipoDeChamadoDeFabrica extends Omit<PedidoDoTipoDeChamado, 'icone' | 'frase'> {
  icone: IconeDoTipoDeChamado;
  frase: string;
  formulario: Formulario;
}

/** O que todo tipo de fábrica tem: ninguém por padrão, "Cai na triagem" e o colaborador o vê. */
const COMUM = {
  atendePorPadrao: null,
  semNinguem: 'triagem',
  podeVirarOs: false,
  geraSolicitacao: 'nao',
  tipoDeAtivoDoEquipamento: null,
  pedeOAtivo: false,
  apareceParaOColaborador: true,
  soATiAbre: false,
} as const;

/** Um lado do prazo, como `[30, 'min']`. */
type Valor = [number, UnidadeDoPrazo];

const valor = ([numero, unidade]: Valor) => ({ valor: numero, unidade });

const prazo = (modo: PrazoDoTipo['modo'], resposta: Valor, resolucao: Valor): PrazoDoTipo => ({
  modo,
  resposta: valor(resposta),
  resolucao: valor(resolucao),
});

/** O campo com os padrões do construtor: opcional, que a pessoa vê, e apagado se sumir. */
function campo(
  id: string,
  tipo: TipoDeCampoDoChamado,
  rotulo: string,
  parte: Partial<Omit<CampoDoFormulario, 'id' | 'tipo' | 'rotulo'>> = {},
): CampoDoFormulario {
  return {
    id,
    tipo,
    rotulo,
    nomeNoResumo: null,
    obrigatorio: false,
    soDaTi: false,
    apagarSeSumir: true,
    opcoes: [],
    tiposDeAtivo: [],
    condicao: [],
    ...parte,
  };
}

const opcoes = (...pares: [string, string][]): OpcaoDoCampo[] =>
  pares.map(([id, texto]) => ({ id, texto }));

/** O campo que só aparece com uma opção de um campo anterior. */
const soCom = (campoId: string, opcaoId: string) => [{ campoId, juncao: null, opcaoId }];

const pelo = (campoId: string | null, comecaPeloTipo = true): TituloDoFormulario => ({
  comecaPeloTipo,
  campoId,
});

// Os campos que se repetem entre os tipos, cada formulário com o seu objeto.
const ativo = (id: string, rotulo: string) =>
  campo(id, 'ativo', rotulo, { nomeNoResumo: 'Ativo', obrigatorio: true });
const detalhes = () =>
  campo('detalhes', 'texto-longo', 'Quer contar mais?', { nomeNoResumo: 'Detalhes' });
const foto = () => campo('foto', 'anexo', 'Uma foto ajuda', { nomeNoResumo: 'Foto' });
const onde = (obrigatorio: boolean) =>
  campo('local', 'local', 'Onde você está?', { nomeNoResumo: 'Local', obrigatorio });
const problema = (lista: OpcaoDoCampo[]) =>
  campo('problema', 'escolha-unica', 'O que está acontecendo?', {
    nomeNoResumo: 'Problema',
    obrigatorio: true,
    opcoes: lista,
  });

export const TIPOS_DE_CHAMADO_DE_FABRICA: readonly TipoDeChamadoDeFabrica[] = [
  {
    ...COMUM,
    nome: 'Toner',
    icone: 'gota',
    frase: 'A impressora está sem toner ou a cópia saiu fraca',
    prazo: prazo('corridas', [30, 'min'], [8, 'h']),
    geraSolicitacao: 'toner',
    pedeOAtivo: true,
    formulario: {
      titulo: pelo('cor'),
      campos: [
        ativo('impressora', 'Qual impressora?'),
        campo('cor', 'escolha-unica', 'Qual cor acabou?', {
          nomeNoResumo: 'Cor',
          obrigatorio: true,
          opcoes: opcoes(
            ['preto', 'Preto'],
            ['ciano', 'Ciano'],
            ['magenta', 'Magenta'],
            ['amarelo', 'Amarelo'],
          ),
        }),
      ],
    },
  },
  {
    ...COMUM,
    nome: 'Computador',
    icone: 'notebook',
    frase: 'Não liga, está lento ou travando',
    prazo: prazo('corridas', [30, 'min'], [5, 'h']),
    podeVirarOs: true,
    pedeOAtivo: true,
    formulario: {
      titulo: pelo('problema'),
      campos: [
        ativo('computador', 'Qual computador?'),
        problema(
          opcoes(
            ['nao-liga', 'Não liga'],
            ['lento', 'Está lento'],
            ['travando', 'Está travando'],
            ['tela-preta', 'Com a tela preta'],
            ['sem-som', 'Sem som'],
            ['teclado-ou-mouse', 'Com o teclado ou o mouse falhando'],
            ['sem-rede', 'Sem rede'],
            ['outro-problema', 'Com outro problema'],
          ),
        ),
        detalhes(),
      ],
    },
  },
  {
    ...COMUM,
    nome: 'Impressora',
    icone: 'impressora',
    frase: 'Mancha, atola ou não imprime',
    prazo: prazo('horario', [30, 'min'], [8, 'h']),
    podeVirarOs: true,
    pedeOAtivo: true,
    formulario: {
      titulo: pelo('problema'),
      campos: [
        ativo('impressora', 'Qual impressora?'),
        problema(
          opcoes(
            ['manchando', 'Manchando'],
            ['nao-puxa-o-papel', 'Não puxa o papel'],
            ['atolando', 'Atolando'],
            ['nao-imprime', 'Não imprime'],
          ),
        ),
        campo('manchas', 'escolha-unica', 'Onde as manchas aparecem?', {
          obrigatorio: true,
          opcoes: opcoes(['borda', 'Na borda'], ['pagina-toda', 'Na página toda']),
          condicao: soCom('problema', 'manchando'),
        }),
        foto(),
        campo('contador-de-paginas', 'numero', 'Contador de páginas', { soDaTi: true }),
        campo('contrato-de-manutencao', 'sim-ou-nao', 'Contrato de manutenção', { soDaTi: true }),
      ],
    },
  },
  {
    ...COMUM,
    nome: 'Acesso e senha',
    icone: 'cadeado',
    frase: 'Esqueci a senha ou preciso entrar numa pasta',
    prazo: prazo('horario', [30, 'min'], [4, 'h']),
    formulario: {
      titulo: pelo('pedido', false),
      campos: [
        campo('pedido', 'escolha-unica', 'O que você precisa?', {
          nomeNoResumo: 'Pedido',
          obrigatorio: true,
          opcoes: opcoes(
            ['esqueci-a-senha', 'Esqueci a senha'],
            ['conta-bloqueada', 'Minha conta bloqueou'],
            ['acesso-a-pasta-ou-sistema', 'Acesso a pasta ou sistema'],
          ),
        }),
        campo('pasta-ou-sistema', 'texto-curto', 'Qual pasta ou sistema?', {
          obrigatorio: true,
          condicao: soCom('pedido', 'acesso-a-pasta-ou-sistema'),
        }),
        campo('motivo', 'texto-longo', 'Por que você precisa?', {
          condicao: soCom('pedido', 'acesso-a-pasta-ou-sistema'),
        }),
      ],
    },
  },
  {
    ...COMUM,
    nome: 'Software',
    icone: 'janela',
    frase: 'Instalar um programa ou ele dá erro',
    prazo: prazo('corridas', [1, 'h'], [24, 'h']),
    formulario: {
      titulo: pelo('programa'),
      campos: [
        campo('pedido', 'escolha-unica', 'O que você precisa?', {
          nomeNoResumo: 'Pedido',
          obrigatorio: true,
          opcoes: opcoes(
            ['instalar', 'Instalar um programa'],
            ['com-erro', 'Um programa está com erro'],
          ),
        }),
        campo('programa', 'texto-curto', 'Qual programa?', {
          nomeNoResumo: 'Programa',
          obrigatorio: true,
        }),
        detalhes(),
      ],
    },
  },
  {
    ...COMUM,
    nome: 'Rede e internet',
    icone: 'globo',
    frase: 'Sem internet, lenta ou o Wi-Fi não conecta',
    prazo: prazo('corridas', [30, 'min'], [8, 'h']),
    formulario: {
      titulo: pelo('problema', false),
      campos: [
        problema(
          opcoes(
            ['sem-internet', 'Sem internet'],
            ['internet-lenta', 'Internet lenta'],
            ['wi-fi-nao-conecta', 'Wi-Fi não conecta'],
            ['conexao-cai', 'A conexão cai toda hora'],
          ),
        ),
        onde(true),
        detalhes(),
      ],
    },
  },
  {
    ...COMUM,
    nome: 'Telefone',
    icone: 'telefone',
    frase: 'Ramal sem tom, chiado ou celular da empresa',
    prazo: prazo('corridas', [1, 'h'], [10, 'h']),
    formulario: {
      titulo: pelo('problema'),
      campos: [
        campo('telefone', 'escolha-unica', 'Qual telefone?', {
          nomeNoResumo: 'Telefone',
          obrigatorio: true,
          opcoes: opcoes(
            ['ramal-da-mesa', 'Ramal da mesa'],
            ['celular-da-empresa', 'Celular da empresa'],
          ),
        }),
        problema(
          opcoes(
            ['sem-tom', 'Sem tom'],
            ['com-chiado', 'Com chiado'],
            ['nao-toca', 'Não toca'],
            ['nao-liga', 'Não liga'],
          ),
        ),
      ],
    },
  },
  {
    ...COMUM,
    nome: 'Outro',
    icone: 'reticencias',
    frase: 'Não achou o seu caso? Conte com as suas palavras',
    prazo: prazo('corridas', [1, 'h'], [24, 'h']),
    formulario: {
      titulo: pelo(null, false),
      campos: [
        campo('relato', 'texto-longo', 'Conte o que aconteceu', {
          nomeNoResumo: 'Relato',
          obrigatorio: true,
        }),
        onde(false),
        foto(),
      ],
    },
  },
  {
    ...COMUM,
    nome: 'Troca de equipamento',
    icone: 'setas',
    frase: 'Trocar um equipamento por outro',
    prazo: prazo('horario', [1, 'h'], [3, 'd']),
    podeVirarOs: true,
    pedeOAtivo: true,
    soATiAbre: true,
    formulario: {
      titulo: pelo('equipamento'),
      campos: [
        ativo('equipamento', 'Qual equipamento?'),
        campo('motivo', 'texto-longo', 'Por quê?', { nomeNoResumo: 'Motivo', obrigatorio: true }),
      ],
    },
  },
];
