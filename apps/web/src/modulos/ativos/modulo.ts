import { Boxes } from 'lucide-react';
import { CHAVE_DOS_RESUMOS } from '../../relacoes/resumos.ts';
import { chaveDasVisoes } from '../../tabelas/visoes.ts';
import { CHAVE_DA_ESCOLHA_DOS_FORNECEDORES } from '../administracao/fornecedores/escolha.ts';
import { definirModulo } from '../tipos.ts';
import { ENTRADAS_DOS_ATIVOS, provedorDeAtivos, provedorDeVisoes } from './busca.ts';
import {
  CHAVE_DAS_CAPACIDADES,
  CHAVE_DOS_ATIVOS,
  CHAVE_DOS_CAMPOS,
  CHAVE_DOS_LIGADOS,
  CHAVE_DOS_MODELOS,
  CHAVE_DOS_TIPOS,
} from './consultas.ts';
import { CHAVE_DOS_BACKUPS } from './controlid/consultas.ts';
import { MENU_DINAMICO_DOS_ATIVOS } from './menu.ts';
import { CHAVE_DOS_CONSUMIVEIS_DO_MODELO } from './modelos/ConsumiveisDoModelo.tsx';
import { RELACOES_DOS_ATIVOS } from './relacoes.tsx';
import { rotasDosAtivos } from './rotas.tsx';
import { CHAVE_DO_SOFTWARE } from './software/consultas.ts';
import { OPCOES_DOS_SUPRIMENTOS, SuprimentosQueAcabam } from './suprimentos.tsx';

/**
 * O módulo Ativos no registro (spec modulo-ativos): só para quem vê ativos, com "Todos os ativos",
 * que ganha, dos dados, os tipos ativos e as visões fixadas. O catálogo, as importações, o Software
 * e o Control iD ficam na Gestão de ativos. No celular, logo depois do Início. Na busca, os ativos,
 * as visões e o cadastro do ativo. Os eventos relêem a lista e a ficha abertas, o catálogo e as
 * visões da tabela.
 */
export const ativos = definirModulo({
  id: 'ativos',
  nome: 'Ativos',
  icone: Boxes,
  endereco: '/ativos',
  prioridadeNoCelular: 2,
  rotas: rotasDosAtivos,
  permissoes: ['ativos.ver'],
  menu: [{ rotulo: 'Todos os ativos', destino: '/ativos' }],
  // Os tipos e as visões fixadas, depois de "Todos os ativos" (changes visoes-no-dock e
  // gestao-de-ativos).
  menuDinamico: MENU_DINAMICO_DOS_ATIVOS,
  busca: {
    entradas: ENTRADAS_DOS_ATIVOS,
    provedores: [provedorDeAtivos, provedorDeVisoes],
  },
  // Os ativos da pessoa, do local, do modelo e do tipo, nas fichas deles (change relacoes-vivas).
  relacoes: RELACOES_DOS_ATIVOS,
  // A prateleira dos toners que acabam primeiro, no Início (change inicio-ajustavel).
  blocosDoInicio: [
    {
      id: 'ativos.suprimentos',
      titulo: 'Suprimentos que acabam primeiro',
      opcoes: OPCOES_DOS_SUPRIMENTOS,
      componente: SuprimentosQueAcabam,
      permissoes: ['ativos.ver'],
    },
  ],
  // Os eventos ficam ligados para o registro inteiro: os do catálogo, do Control iD e do software
  // relêem também as telas da Gestão de ativos, que mostram as mesmas consultas.
  eventos: {
    // Um ativo: as listas, a ficha dele, com o histórico, e os ligados, porque ele pode aparecer no
    // lado de lá de outros.
    'ativos.mudaram': ({ alvo }) => [
      CHAVE_DOS_ATIVOS,
      // As contagens dos cartões: os ativos da pessoa, do local, do modelo e do tipo.
      CHAVE_DOS_RESUMOS,
      alvo?.tipo === 'ativo' && alvo.id ? ['ativo', alvo.id] : ['ativo'],
      CHAVE_DOS_LIGADOS,
    ],
    // Um tipo, um campo, um modelo ou a imagem dele: o catálogo, e os ativos e os ligados, que os
    // mostram.
    'catalogo.mudou': () => [
      CHAVE_DOS_RESUMOS,
      CHAVE_DOS_TIPOS,
      CHAVE_DOS_CAMPOS,
      CHAVE_DAS_CAPACIDADES,
      CHAVE_DOS_MODELOS,
      ['modelo'],
      CHAVE_DOS_ATIVOS,
      ['ativo'],
      CHAVE_DOS_LIGADOS,
      // Ligar ou desligar a capacidade num tipo mostra ou esconde os compatíveis do modelo.
      CHAVE_DOS_CONSUMIVEIS_DO_MODELO,
    ],
    // O caminho do local aparece na lista, na ficha e nos ligados; o nome da pessoa, na lista e na
    // ficha, com o histórico.
    'locais.mudaram': () => [CHAVE_DOS_ATIVOS, ['ativo'], CHAVE_DOS_LIGADOS],
    'pessoas.mudaram': () => [CHAVE_DOS_ATIVOS, ['ativo']],
    // O nome do fornecedor aparece na lista e na ficha, e a escolha traz só os ativos (change
    // p4a-fornecedores).
    'fornecedores.mudaram': () => [CHAVE_DOS_ATIVOS, ['ativo'], CHAVE_DA_ESCOLHA_DOS_FORNECEDORES],
    // A disponibilidade de um ativo mudou de situação: a lista e a ficha dele.
    'disponibilidade.mudou': ({ alvo }) => [
      CHAVE_DOS_ATIVOS,
      alvo?.tipo === 'ativo' && alvo.id ? ['ativo', alvo.id] : ['ativo'],
    ],
    // Um segredo do cofre: a ficha aberta, que mostra os segredos ligados ao ativo.
    'cofre.mudou': () => [['ativo']],
    // Um consumível: a ficha aberta e a do modelo, que mostram os compatíveis (change
    // p4b-consumiveis).
    'consumiveis.mudaram': () => [['ativo'], CHAVE_DOS_CONSUMIVEIS_DO_MODELO],
    // Uma movimentação: o saldo dos compatíveis na ficha aberta (change p4c-estoque).
    'estoque.mudou': () => [['ativo']],
    // Uma visão da tabela dos ativos: o menu da visão, e a tabela aberta nela.
    'visoes.mudaram': () => [chaveDasVisoes('ativos')],
    // Um backup do Control iD pedido, terminado ou apagado: a seção da ficha e a tela dos backups.
    'controlid.mudaram': () => [CHAVE_DOS_BACKUPS],
    // Um pacote ou uma distribuição: a base, as distribuições e as fichas abertas.
    'software.mudou': () => [CHAVE_DO_SOFTWARE],
  },
});
