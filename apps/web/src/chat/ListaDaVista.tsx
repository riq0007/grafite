// A lista de cada vista do chat, ao lado da tela escolhida: a do Chat, a da vista Chamados e a das
// Equipes. Os Avisos não têm lista: a tela deles ocupa a largura. A lista fica montada enquanto a
// vista é a mesma, também ao trocar de conversa.
import { ListaDasEquipes } from './ListaDasEquipes.tsx';
import { ListaDoChat } from './ListaDoChat.tsx';
import { ListaDosChamados } from './ListaDosChamados.tsx';
import type { IdDaVista } from './MolduraDoChat.tsx';

export function ListaDaVista({ vista }: { vista: IdDaVista }) {
  switch (vista) {
    case 'chat':
      return <ListaDoChat />;
    case 'chamados':
      return <ListaDosChamados />;
    case 'equipes':
      return <ListaDasEquipes />;
    case 'avisos':
      return null;
  }
}
