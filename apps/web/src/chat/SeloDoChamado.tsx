// O selo da situação do chamado no chat (spec modulo-chat, "Selos e movimento do chat"): a palavra
// de quem participa, sempre com a mesma marca e o mesmo ícone.
import type { SituacaoDoChamado } from '@grafite/domain';
import { RotuloDeSituacao, type Situacao } from '@grafite/ui';
import { Archive, CircleCheck, Hourglass, type LucideIcon, Ticket, Wrench } from 'lucide-react';

const MARCAS: Readonly<
  Record<SituacaoDoChamado | 'fechado', { situacao: Situacao; icone: LucideIcon }>
> = {
  triagem: { situacao: 'neutra', icone: Ticket },
  'em-atendimento': { situacao: 'info', icone: Wrench },
  aguardando: { situacao: 'atencao', icone: Hourglass },
  resolvido: { situacao: 'sucesso', icone: CircleCheck },
  fechado: { situacao: 'neutra', icone: Archive },
};

export function SeloDoChamado({
  situacao,
  fechado,
  texto,
}: {
  situacao: SituacaoDoChamado;
  fechado: boolean;
  /** A situação nas palavras de quem participa, como a API a manda: "Aguardando você". */
  texto: string;
}) {
  const marca = MARCAS[situacao === 'resolvido' && fechado ? 'fechado' : situacao];
  return (
    <RotuloDeSituacao situacao={marca.situacao} icone={marca.icone}>
      {texto}
    </RotuloDeSituacao>
  );
}
