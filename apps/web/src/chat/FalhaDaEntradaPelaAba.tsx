// O bilhete da aba recusado duas vezes (change aba-dos-colaboradores, decisão 8): a página mostra o
// erro, e a pessoa fecha e abre o chat de novo pela aba.
import { EstadoVazio } from '@grafite/ui';
import { MessageCircleOff } from 'lucide-react';
import estilos from './MolduraDoChat.module.css';

export function FalhaDaEntradaPelaAba({ erro }: { erro: string }) {
  return (
    <main className={estilos.motivo}>
      <EstadoVazio icone={MessageCircleOff} titulo="O chat da aba não abriu." descricao={erro} />
    </main>
  );
}
