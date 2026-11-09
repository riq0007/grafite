// O que se posiciona no mapa além dos ativos (specs salas-de-reuniao, "Salas no mapa da planta", e
// painel-de-dashboards, "Painéis no mapa da planta"): quem edita o mapa posiciona as salas e os
// painéis como os ativos, escolhendo o alvo numa lista fechada, só com os ativos dele.
import { Selecao } from '@grafite/ui';
import type { ContaDoSeletor } from '../administracao/seletores/SeletorDeConta.tsx';
import { usePaineis } from '../paineis/consultas.ts';
import { useCadastroDasSalas } from '../salas/consultas.ts';

/** O nome de cada tipo de alvo na escolha e no artigo da dica. */
export const ALVOS_DO_MAPA: Record<string, { rotulo: string; dica: string }> = {
  ativo: { rotulo: 'Ativo', dica: 'Escolha o ativo e clique no ponto do mapa.' },
  sala: { rotulo: 'Sala', dica: 'Escolha a sala e clique no ponto do mapa.' },
  painel: { rotulo: 'Painel', dica: 'Escolha o painel e clique no ponto do mapa.' },
};

interface PropsDaEscolha {
  valor: ContaDoSeletor | null;
  aoEscolher: (alvo: ContaDoSeletor | null) => void;
}

function EscolhaNaLista({
  rotulo,
  dica,
  opcoes,
  carregando,
  valor,
  aoEscolher,
}: PropsDaEscolha & {
  rotulo: string;
  dica: string;
  opcoes: ContaDoSeletor[];
  carregando: boolean;
}) {
  return (
    <Selecao
      rotulo={rotulo}
      descricao={dica}
      opcoes={opcoes}
      placeholder={carregando ? 'Carregando…' : opcoes.length === 0 ? 'Nenhum ativo' : 'Selecione'}
      selectedKey={valor?.id ?? null}
      onSelectionChange={(chave) =>
        aoEscolher(opcoes.find((opcao) => opcao.id === String(chave)) ?? null)
      }
    />
  );
}

export function EscolhaDaSala(props: PropsDaEscolha) {
  const salas = useCadastroDasSalas();
  const opcoes = (salas.data?.salas ?? [])
    .filter((sala) => sala.situacao === 'ativo')
    .map((sala) => ({ id: sala.id, rotulo: sala.nome }));
  return (
    <EscolhaNaLista
      {...props}
      rotulo="Sala"
      dica={ALVOS_DO_MAPA.sala?.dica ?? ''}
      opcoes={opcoes}
      carregando={salas.isPending}
    />
  );
}

export function EscolhaDoPainel(props: PropsDaEscolha) {
  const paineis = usePaineis();
  const opcoes = (paineis.data?.paineis ?? [])
    .filter((painel) => painel.situacao === 'ativo')
    .map((painel) => ({ id: painel.id, rotulo: painel.nome }));
  return (
    <EscolhaNaLista
      {...props}
      rotulo="Painel"
      dica={ALVOS_DO_MAPA.painel?.dica ?? ''}
      opcoes={opcoes}
      carregando={paineis.isPending}
    />
  );
}
