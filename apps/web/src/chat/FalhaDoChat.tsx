// O que não carregou numa tela do chat, como a lista ou a conversa: o motivo, em texto, e "Tentar de
// novo", que relê.
import { Botao, Icone } from '@grafite/ui';
import { CircleAlert } from 'lucide-react';
import estilos from './FalhaDoChat.module.css';

export function FalhaDoChat({
  mensagem,
  relendo,
  tentarDeNovo,
}: {
  mensagem: string;
  relendo: boolean;
  tentarDeNovo: () => void;
}) {
  return (
    <div role="alert" className={estilos.falha}>
      <p>
        <span className={estilos.marcaDaFalha}>
          <Icone icone={CircleAlert} tamanho={14} />
        </span>
        {mensagem}
      </p>
      <Botao carregando={relendo} rotuloCarregando="Tentando de novo" onPress={tentarDeNovo}>
        Tentar de novo
      </Botao>
    </div>
  );
}
