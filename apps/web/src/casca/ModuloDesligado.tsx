import { Botao, CabecalhoDaPagina, EstadoVazio } from '@grafite/ui';
import { useNavigate } from '@tanstack/react-router';
import { PowerOff } from 'lucide-react';
import { useAcesso } from '../sessao/useAcesso.ts';

/**
 * A tela de um módulo que a organização desligou, aberta pelo endereço (spec
 * modulos-da-organizacao): o nome do módulo no título, que ele está desligado e a quem pedir para
 * ligá-lo. Quem define os padrões da organização vai dali à seção Módulos da Administração. As
 * telas do módulo não abrem, e os dados dele não são pedidos.
 */
export function ModuloDesligado({ nome }: { nome: string }) {
  const { pode } = useAcesso();
  const navegar = useNavigate();
  const podeLigar = pode('organizacao.editar');
  return (
    <>
      <CabecalhoDaPagina titulo={nome} />
      <EstadoVazio
        icone={PowerOff}
        titulo={`O módulo ${nome} está desligado nesta organização.`}
        descricao={
          podeLigar
            ? 'Você pode ligá-lo na seção Módulos da Administração.'
            : 'Peça a quem define os padrões da organização para ligá-lo.'
        }
        acao={
          podeLigar ? (
            <Botao onPress={() => void navegar({ to: '/administracao/modulos' })}>
              Abrir Módulos
            </Botao>
          ) : undefined
        }
      />
    </>
  );
}
