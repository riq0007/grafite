// Um módulo desligado nesta organização, no app do chat (change chat-com-chamados, design, decisão
// 15): o motivo e, a quem define os padrões, onde ligá-lo. Pedir acesso não adiantaria.
import { EstadoVazio } from '@grafite/ui';
import { PowerOff } from 'lucide-react';
import { useAcesso } from '../sessao/useAcesso.ts';

export function ModuloDesligado({ titulo }: { titulo: string }) {
  const { pode } = useAcesso();
  return (
    <EstadoVazio
      icone={PowerOff}
      titulo={titulo}
      descricao={
        pode('organizacao.editar')
          ? 'Você pode ligá-lo na seção Módulos da Administração do Grafite.'
          : 'Peça a quem define os padrões da organização para ligá-lo.'
      }
    />
  );
}
