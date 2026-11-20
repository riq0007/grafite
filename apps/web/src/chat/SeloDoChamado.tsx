// O selo da situação do chamado no chat (spec modulo-chat, "Selos e movimento do chat"): a palavra,
// como a API a manda, sempre com a mesma marca e o mesmo ícone. A marca vai pela palavra, como a
// tabela da spec, porque a lista, "Chamados da equipe" e o chip só recebem a palavra; a espera que a
// TI lê, "Aguardando o colaborador", tem a marca da espera.
import {
  ESPERA_DE_OUTRO,
  SITUACOES_PARA_QUEM_PARTICIPA as PALAVRAS,
  SITUACAO_FECHADA,
} from '@grafite/domain';
import { RotuloDeSituacao, type Situacao } from '@grafite/ui';
import { Archive, CircleCheck, Hourglass, type LucideIcon, Ticket, Wrench } from 'lucide-react';

interface MarcaDaPalavra {
  situacao: Situacao;
  icone: LucideIcon;
}

const ABERTO: MarcaDaPalavra = { situacao: 'neutra', icone: Ticket };
const ESPERA: MarcaDaPalavra = { situacao: 'atencao', icone: Hourglass };

const MARCAS: ReadonlyMap<string, MarcaDaPalavra> = new Map([
  [PALAVRAS.triagem, ABERTO],
  [PALAVRAS['em-atendimento'], { situacao: 'info', icone: Wrench }],
  [PALAVRAS.aguardando, ESPERA],
  [ESPERA_DE_OUTRO, ESPERA],
  [PALAVRAS.resolvido, { situacao: 'sucesso', icone: CircleCheck }],
  [SITUACAO_FECHADA, { situacao: 'neutra', icone: Archive }],
]);

export function SeloDoChamado({
  texto,
}: {
  /** A situação nas palavras do chat, como a API a manda: "Aguardando você". */
  texto: string;
}) {
  const marca = MARCAS.get(texto) ?? ABERTO;
  return (
    <RotuloDeSituacao situacao={marca.situacao} icone={marca.icone}>
      {texto}
    </RotuloDeSituacao>
  );
}
