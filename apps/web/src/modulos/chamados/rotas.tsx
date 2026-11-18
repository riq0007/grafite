import { createRoute, Outlet } from '@tanstack/react-router';
import { raiz } from '../../rotas/raiz.tsx';
import { HorarioDaTi } from './ajustes/Horario.tsx';
import { RespostasProntas } from './ajustes/RespostasProntas.tsx';
import { TiposDeChamado } from './ajustes/Tipos.tsx';
import { ChamadoAberto } from './chamado/ChamadoAberto.tsx';
import { InicioDosChamados } from './Inicio.tsx';
import { PrazosDosChamados } from './Prazos.tsx';
import { QuemEstaComOQue } from './QuemEstaComOQue.tsx';

// Cada rota numa constante própria: criadas dentro do addChildren, as filhas perdem os tipos dos
// endereços, e um menu com destino errado passaria a compilar.

const chamados = createRoute({
  getParentRoute: () => raiz,
  path: '/chamados',
  component: Outlet,
});

// O endereço do módulo abre o Início dos chamados, que leva quem só configura aos Tipos de chamado.
const inicio = createRoute({
  getParentRoute: () => chamados,
  path: '/',
  component: InicioDosChamados,
});

const quemEstaComOQue = createRoute({
  getParentRoute: () => chamados,
  path: 'quem-esta-com-o-que',
  component: QuemEstaComOQue,
});

const prazos = createRoute({
  getParentRoute: () => chamados,
  path: 'prazos',
  component: PrazosDosChamados,
});

// O chamado aberto, que as notificações, o quadro e a busca abrem.
const chamado = createRoute({
  getParentRoute: () => chamados,
  path: '$numero',
  component: ChamadoAberto,
});

const tipos = createRoute({
  getParentRoute: () => chamados,
  path: 'tipos',
  component: TiposDeChamado,
});

const respostasProntas = createRoute({
  getParentRoute: () => chamados,
  path: 'respostas-prontas',
  component: RespostasProntas,
});

const horario = createRoute({
  getParentRoute: () => chamados,
  path: 'horario',
  component: HorarioDaTi,
});

/** As rotas dos Chamados (change chamados-da-ti, design, decisão 14, "O módulo na casca"). */
export const rotasDosChamados = chamados.addChildren([
  inicio,
  quemEstaComOQue,
  prazos,
  chamado,
  tipos,
  respostasProntas,
  horario,
]);
