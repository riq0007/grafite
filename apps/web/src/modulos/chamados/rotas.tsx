import { createRoute, Outlet } from '@tanstack/react-router';
import { raiz } from '../../rotas/raiz.tsx';
import { validarAbertura } from './abertura/abertura.ts';
import { HorarioDaTi } from './ajustes/Horario.tsx';
import { RespostasProntas } from './ajustes/RespostasProntas.tsx';
import { ChamadoAberto } from './chamado/ChamadoAberto.tsx';
import { InicioDosChamados } from './Inicio.tsx';
import { PrazosDosChamados } from './Prazos.tsx';
import { QuemEstaComOQue } from './QuemEstaComOQue.tsx';
import { validarTipoEscolhido } from './tipos/edicao.ts';
import { TiposDeChamado } from './tipos/TiposDeChamado.tsx';

// Cada rota numa constante própria: criadas dentro do addChildren, as filhas perdem os tipos dos
// endereços, e um menu com destino errado passaria a compilar.

const chamados = createRoute({
  getParentRoute: () => raiz,
  path: '/chamados',
  component: Outlet,
});

// O endereço do módulo abre o Início dos chamados, que leva quem só configura aos Tipos de chamado.
// O Início, "Quem está com o quê" e os Prazos abrem a gaveta da abertura pelo `abrir` do endereço.
const inicio = createRoute({
  getParentRoute: () => chamados,
  path: '/',
  validateSearch: validarAbertura,
  component: InicioDosChamados,
});

const quemEstaComOQue = createRoute({
  getParentRoute: () => chamados,
  path: 'quem-esta-com-o-que',
  validateSearch: validarAbertura,
  component: QuemEstaComOQue,
});

const prazos = createRoute({
  getParentRoute: () => chamados,
  path: 'prazos',
  validateSearch: validarAbertura,
  component: PrazosDosChamados,
});

// O chamado aberto, que as notificações, o quadro e a busca abrem.
const chamado = createRoute({
  getParentRoute: () => chamados,
  path: '$numero',
  component: ChamadoAberto,
});

// Os tipos de chamado, com o tipo escolhido no endereço (`?tipo=<id>`).
const tipos = createRoute({
  getParentRoute: () => chamados,
  path: 'tipos',
  validateSearch: validarTipoEscolhido,
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
