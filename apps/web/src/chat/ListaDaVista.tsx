// A lista de cada vista do chat, ao lado da tela escolhida: a do Chat e, até as tarefas delas, as da
// vista Chamados, das Equipes e dos Avisos, só com o título. A lista fica montada enquanto a vista é
// a mesma, também ao trocar de conversa.
import { ListaDoChat } from './ListaDoChat.tsx';
import estilos from './MolduraDoChat.module.css';
import type { IdDaVista } from './MolduraDoChat.tsx';

function ColunaDaVista({ titulo }: { titulo: string }) {
  return (
    <section aria-label={titulo} className={estilos.lista}>
      <h1 className={estilos.tituloDaLista}>{titulo}</h1>
    </section>
  );
}

export function ListaDaVista({ vista }: { vista: IdDaVista }) {
  switch (vista) {
    case 'chat':
      return <ListaDoChat />;
    case 'chamados':
      return <ColunaDaVista titulo="Chamados" />;
    case 'equipes':
      return <ColunaDaVista titulo="Equipes" />;
    case 'avisos':
      return <ColunaDaVista titulo="Avisos" />;
  }
}
