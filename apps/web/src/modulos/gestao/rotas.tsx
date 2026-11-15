import { createRoute, Outlet, redirect } from '@tanstack/react-router';
import { raiz } from '../../rotas/raiz.tsx';
import { Catalogo, InicioDoCatalogo } from '../ativos/Catalogo.tsx';
import { CampoNovo } from '../ativos/campos/CampoNovo.tsx';
import { Campos } from '../ativos/campos/Campos.tsx';
import { FichaDoCampo } from '../ativos/campos/FichaDoCampo.tsx';
import { TelaDosBackups } from '../ativos/controlid/BackupsDoControlId.tsx';
import { CompararBackups } from '../ativos/controlid/CompararBackups.tsx';
import { validarFiltroDeSituacao, validarFiltrosDeModelos } from '../ativos/filtros.ts';
import { Importacao } from '../ativos/importacao/Importacao.tsx';
import { ImportacaoNova } from '../ativos/importacao/ImportacaoNova.tsx';
import { Importacoes } from '../ativos/importacao/Importacoes.tsx';
import { FichaDoModelo } from '../ativos/modelos/FichaDoModelo.tsx';
import { ModeloNovo } from '../ativos/modelos/ModeloNovo.tsx';
import { Modelos } from '../ativos/modelos/Modelos.tsx';
import { BaseDePacotes } from '../ativos/software/BaseDePacotes.tsx';
import { lerAbaDoSoftware, TelaDasDistribuicoes } from '../ativos/software/Distribuicoes.tsx';
import { FichaDaDistribuicao } from '../ativos/software/FichaDaDistribuicao.tsx';
import { FichaDoPacote } from '../ativos/software/FichaDoPacote.tsx';
import { FichaDoTipo } from '../ativos/tipos/FichaDoTipo.tsx';
import { TipoNovo } from '../ativos/tipos/TipoNovo.tsx';
import { Tipos } from '../ativos/tipos/Tipos.tsx';
import { InicioDaGestao } from './Inicio.tsx';

// As telas da Gestão de ativos (change gestao-de-ativos, design, decisão 3): as rotas saíram de
// /ativos, e os componentes continuam nas pastas do Ativos. Cada rota numa constante própria:
// criadas dentro do addChildren, as filhas perdem os tipos dos endereços.

const gestao = createRoute({
  getParentRoute: () => raiz,
  path: '/gestao',
  component: Outlet,
});

const inicio = createRoute({
  getParentRoute: () => gestao,
  path: '/',
  component: InicioDaGestao,
});

const importacoes = createRoute({
  getParentRoute: () => gestao,
  path: 'importacoes',
  component: Importacoes,
});

const importacaoNova = createRoute({
  getParentRoute: () => gestao,
  path: 'importacoes/nova',
  component: ImportacaoNova,
});

const importacao = createRoute({
  getParentRoute: () => gestao,
  path: 'importacoes/$id',
  component: Importacao,
});

// Os backups do Control iD (change p5a-backup-do-control-id).
const backupsDoControlId = createRoute({
  getParentRoute: () => gestao,
  path: 'control-id/backups',
  component: TelaDosBackups,
});

const compararBackups = createRoute({
  getParentRoute: () => gestao,
  path: 'control-id/comparar',
  component: CompararBackups,
});

// A distribuição de software (change distribuicao-de-software): a base de pacotes, a ficha de cada
// pacote e as distribuições, cada uma na tela dela (change software-por-pacote); o endereço antigo
// da aba das distribuições leva à tela delas.
const software = createRoute({
  getParentRoute: () => gestao,
  path: 'software',
  validateSearch: lerAbaDoSoftware,
  beforeLoad: ({ search }) => {
    if (search.aba === 'distribuicoes') {
      throw redirect({ to: '/gestao/software/distribuicoes', replace: true });
    }
  },
  component: BaseDePacotes,
});

const pacoteDeSoftware = createRoute({
  getParentRoute: () => gestao,
  path: 'software/pacotes/$id',
  component: FichaDoPacote,
});

const distribuicoesDeSoftware = createRoute({
  getParentRoute: () => gestao,
  path: 'software/distribuicoes',
  component: TelaDasDistribuicoes,
});

const distribuicaoDeSoftware = createRoute({
  getParentRoute: () => gestao,
  path: 'software/distribuicoes/$id',
  component: FichaDaDistribuicao,
});

const catalogo = createRoute({
  getParentRoute: () => gestao,
  path: 'catalogo',
  component: Catalogo,
});

const inicioDoCatalogo = createRoute({
  getParentRoute: () => catalogo,
  path: '/',
  component: InicioDoCatalogo,
});

const tipos = createRoute({
  getParentRoute: () => catalogo,
  path: 'tipos',
  validateSearch: validarFiltroDeSituacao,
  component: Tipos,
});

const tipoNovo = createRoute({
  getParentRoute: () => catalogo,
  path: 'tipos/novo',
  component: TipoNovo,
});

const tipo = createRoute({
  getParentRoute: () => catalogo,
  path: 'tipos/$id',
  component: FichaDoTipo,
});

const campos = createRoute({
  getParentRoute: () => catalogo,
  path: 'campos',
  validateSearch: validarFiltroDeSituacao,
  component: Campos,
});

const campoNovo = createRoute({
  getParentRoute: () => catalogo,
  path: 'campos/novo',
  component: CampoNovo,
});

const campo = createRoute({
  getParentRoute: () => catalogo,
  path: 'campos/$id',
  component: FichaDoCampo,
});

const modelos = createRoute({
  getParentRoute: () => catalogo,
  path: 'modelos',
  validateSearch: validarFiltrosDeModelos,
  component: Modelos,
});

const modeloNovo = createRoute({
  getParentRoute: () => catalogo,
  path: 'modelos/novo',
  component: ModeloNovo,
});

const modelo = createRoute({
  getParentRoute: () => catalogo,
  path: 'modelos/$id',
  component: FichaDoModelo,
});

export const rotasDaGestao = gestao.addChildren([
  inicio,
  importacoes,
  importacaoNova,
  importacao,
  backupsDoControlId,
  compararBackups,
  software,
  pacoteDeSoftware,
  distribuicoesDeSoftware,
  distribuicaoDeSoftware,
  catalogo.addChildren([
    inicioDoCatalogo,
    tipos,
    tipoNovo,
    tipo,
    campos,
    campoNovo,
    campo,
    modelos,
    modeloNovo,
    modelo,
  ]),
]);
