import { Botao, EstadoVazio } from '@grafite/ui';
import { useNavigate } from '@tanstack/react-router';
import { ShieldAlert } from 'lucide-react';

export const FRASE_SEM_DOIS_PASSOS =
  'Cadastre a verificação em dois passos em Ajustes › Conta para usar o cofre.';

/**
 * A conta sem a verificação em dois passos (spec cofre-de-segredos, "Verificação para usar o
 * cofre"): a frase da API e o caminho até o cadastro, sem nenhum segredo.
 */
export function SemDoisPassos() {
  const navegar = useNavigate();
  return (
    <EstadoVazio
      icone={ShieldAlert}
      titulo={FRASE_SEM_DOIS_PASSOS}
      acao={
        <Botao nivel="primario" onPress={() => void navegar({ to: '/ajustes/conta' })}>
          Abrir Ajustes › Conta
        </Botao>
      }
    />
  );
}
