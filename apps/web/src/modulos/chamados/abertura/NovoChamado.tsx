// O "Novo chamado" dos cabeçalhos do Início, de "Quem está com o quê" e dos Prazos (spec
// modulo-chamados, "Abrir um chamado"; change chamados-da-ti, design, "A gaveta da abertura (tarefa
// 5.18)"): o botão, só a quem atende, põe o `abrir` no endereço da tela, o mesmo da ação "Abrir um
// chamado" da busca, e a gaveta abre sobre a tela em que se está. Abrir e fechar trocam o endereço
// sem entrada nova no histórico: o voltar do navegador sai da tela, e não reabre a gaveta.
import { Botao } from '@grafite/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { GavetaDaAbertura } from './GavetaDaAbertura.tsx';

export function NovoChamado() {
  const { pode } = useAcesso();
  const { abrir } = useSearch({ strict: false });
  const navegar = useNavigate();
  if (!pode('chamados.atender')) return null;
  const mudarAberta = (aberta: boolean) =>
    void navegar({
      to: '.',
      search: (atual) => ({ ...atual, abrir: aberta ? (1 as const) : undefined }),
      replace: true,
    });
  return (
    <>
      <Botao nivel="primario" icone={Plus} onPress={() => mudarAberta(true)}>
        Novo chamado
      </Botao>
      {abrir === 1 && <GavetaDaAbertura aoFechar={() => mudarAberta(false)} />}
    </>
  );
}
