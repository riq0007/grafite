import { LifeBuoy } from 'lucide-react';
import { definirModulo } from '../tipos.ts';
import { ENTRADAS_DOS_CHAMADOS } from './busca.ts';
import {
  CHAVE_DA_FICHA_DO_CHAMADO,
  CHAVE_DOS_AJUSTES_DOS_CHAMADOS,
  CHAVE_DOS_CHAMADOS,
} from './consultas.ts';
import { PERMISSOES_DE_CONFIGURAR, PERMISSOES_DE_VER } from './permissoes.ts';
import { rotasDosChamados } from './rotas.tsx';

/** As consultas que relêem os chamados inteiros: o quadro, os prazos e a ficha. */
const osChamados = () => [CHAVE_DOS_CHAMADOS];
/** As consultas que relêem só a ficha, que mostra o que vem das outras capacidades. */
const aFicha = () => [CHAVE_DA_FICHA_DO_CHAMADO];

/**
 * O módulo Chamados no registro (spec modulo-chamados, "Chamados no dock", "Primeira tela ao entrar"
 * e "Telas atualizadas e módulo desligado"; change chamados-da-ti, design, decisão 14): o primeiro
 * do dock e do celular, antes do Início, com a boia, para quem vê, atende ou configura os chamados,
 * e a primeira tela ao entrar de quem os vê ou os atende. O menu tem as telas de ver e, depois de
 * uma linha, as de configurar, cada uma a quem tem a permissão dela; na busca, as telas e a ação de
 * abrir um chamado, a quem atende. Os eventos dos chamados e dos ajustes relêem as telas deles, e
 * os das outras capacidades, o que as telas mostram delas.
 */
export const chamados = definirModulo({
  id: 'chamados',
  nome: 'Chamados',
  icone: LifeBuoy,
  endereco: '/chamados',
  prioridadeNoCelular: 0,
  rotas: rotasDosChamados,
  permissoes: ['chamados.ver', 'chamados.atender', 'chamados.configurar'],
  primeiraTela: { permissoes: PERMISSOES_DE_VER },
  menu: [
    { rotulo: 'Início', destino: '/chamados', permissoes: PERMISSOES_DE_VER },
    {
      rotulo: 'Quem está com o quê',
      destino: '/chamados/quem-esta-com-o-que',
      permissoes: PERMISSOES_DE_VER,
    },
    { rotulo: 'Prazos', destino: '/chamados/prazos', permissoes: PERMISSOES_DE_VER },
    {
      rotulo: 'Tipos de chamado',
      destino: '/chamados/tipos',
      separadoAntes: true,
      permissoes: PERMISSOES_DE_CONFIGURAR,
    },
    {
      rotulo: 'Respostas prontas',
      destino: '/chamados/respostas-prontas',
      permissoes: PERMISSOES_DE_CONFIGURAR,
    },
    { rotulo: 'Horário da TI', destino: '/chamados/horario', permissoes: PERMISSOES_DE_CONFIGURAR },
  ],
  busca: { entradas: ENTRADAS_DOS_CHAMADOS },
  eventos: {
    'chamados.mudaram': osChamados,
    // O horário fecha os relógios dos chamados, e o tipo dá o nome e o prazo deles.
    'ajustes-dos-chamados.mudaram': () => [CHAVE_DOS_AJUSTES_DOS_CHAMADOS, CHAVE_DOS_CHAMADOS],
    // O nome de quem pediu e das contas da TI, o caminho dos locais, quem atende e o alcance, e o
    // ativo ligado.
    'pessoas.mudaram': osChamados,
    'locais.mudaram': osChamados,
    'acessos.mudaram': osChamados,
    'ativos.mudaram': osChamados,
    // Os alertas da conversa, a OS, a solicitação e o resumo do ativo, que muda com o Alertas e o
    // Operação desligados.
    'alertas.mudaram': aFicha,
    'ordens.mudaram': aFicha,
    'solicitacoes.mudaram': aFicha,
    'estoque.mudou': aFicha,
    'consumiveis.mudaram': aFicha,
    'disponibilidade.mudou': aFicha,
    'catalogo.mudou': aFicha,
    'modulos.mudaram': aFicha,
  },
});
