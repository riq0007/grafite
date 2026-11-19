// A tabela dos tipos (change chamados-da-ti, design, decisão 15, "A tela dos tipos (tarefa 5.19)" e
// "O rascunho, o duplicar e a situação (tarefa 5.20)"; m07 e m08): a alça, o tipo com o ícone e o
// selo da exceção, ou o "copiado daqui" da origem de um Rascunho, o prazo da resolução em mono,
// quem atende e os abertos. A linha escolhida é o tipo do editor. A ordem muda pela alça, com o
// `useArrastar`, e, no teclado, pelo "Subir" e pelo "Descer" do menu da linha.
import {
  type ColunaQueSeOrdena,
  Icone,
  type ItemDoMenuDeContexto,
  TabelaQueSeOrdena,
} from '@grafite/ui';
import { Copy } from 'lucide-react';
import { useMemo } from 'react';
import { IconeDoTipo, Selo } from '../Pecas.tsx';
import { useArrastar } from '../useArrastar.ts';
import {
  moverNaOrdem,
  movimentosNaOrdem,
  prazoNaTabela,
  quemAtendeNaTabela,
  reordenar,
  seloDoTipo,
  type TipoDeChamado,
} from './edicao.ts';
import estilos from './Tipos.module.css';

export interface PropsDaTabelaDosTipos {
  tipos: readonly TipoDeChamado[];
  /** O id do título da coluna, que dá o nome da tabela. */
  idDoTitulo: string;
  escolhido: string;
  aoEscolher: (id: string) => void;
  /** A ordem nova, com todos os ids. */
  aoReordenar: (ids: string[]) => void;
  /** Os tipos de onde um Rascunho foi duplicado, marcados "copiado daqui". */
  origens: ReadonlySet<string>;
}

/** As colunas, com a marca da origem de um Rascunho duplicado embaixo do nome. */
function colunasDosTipos(origens: ReadonlySet<string>): ColunaQueSeOrdena<TipoDeChamado>[] {
  return [
    {
      id: 'tipo',
      titulo: 'Tipo',
      nomeDaLinha: true,
      celula: (tipo) => {
        const selo = seloDoTipo(tipo);
        const origem = origens.has(tipo.id);
        return (
          <span className={estilos.tipoNaLinha}>
            <span className={estilos.nomeNaLinha}>
              <IconeDoTipo icone={tipo.icone} nome={tipo.nome} decorativo />
              <span>{tipo.nome}</span>
            </span>
            {(selo || origem) && (
              <span className={estilos.marcasNaLinha}>
                {selo && <Selo selo={selo} />}
                {origem && (
                  <span className={estilos.copiadoDaqui}>
                    <Icone icone={Copy} tamanho={12} />
                    copiado daqui
                  </span>
                )}
              </span>
            )}
          </span>
        );
      },
    },
    { id: 'prazo', titulo: 'Prazo', largura: 54, mono: true, celula: prazoNaTabela },
    { id: 'atende', titulo: 'Atende', largura: 72, celula: quemAtendeNaTabela },
    { id: 'abertos', titulo: 'Abertos', largura: 70, mono: true, celula: (tipo) => tipo.abertos },
  ];
}

const ROTULO_DO_MOVIMENTO = { subir: 'Subir', descer: 'Descer' } as const;

export function TabelaDosTipos({
  tipos,
  idDoTitulo,
  escolhido,
  aoEscolher,
  aoReordenar,
  origens,
}: PropsDaTabelaDosTipos) {
  const ids = tipos.map((tipo) => tipo.id);
  const colunas = useMemo(() => colunasDosTipos(origens), [origens]);
  const mudar = (nova: string[]) => {
    if (nova.some((id, indice) => id !== ids[indice])) aoReordenar(nova);
  };
  const { arraste, alca, alvo } = useArrastar<string>({
    aoSoltar: (id, { chave, metade }) => mudar(reordenar(ids, id, chave, metade)),
  });
  const menuDaLinha = (tipo: TipoDeChamado): ItemDoMenuDeContexto[] =>
    movimentosNaOrdem(ids, tipo.id).map((movimento) => ({
      id: movimento,
      rotulo: ROTULO_DO_MOVIMENTO[movimento],
      aoEscolher: () => mudar(moverNaOrdem(ids, tipo.id, movimento)),
    }));

  return (
    <TabelaQueSeOrdena
      aria-labelledby={idDoTitulo}
      itens={tipos}
      idDe={(tipo) => tipo.id}
      nomeDe={(tipo) => tipo.nome}
      colunas={colunas}
      escolhido={escolhido}
      aoEscolher={aoEscolher}
      alca={(tipo) => alca(tipo.id)}
      alvo={(tipo) => alvo(tipo.id)}
      arraste={
        arraste && {
          noAr: arraste.item,
          encaixe: arraste.alvo && { id: arraste.alvo.chave, metade: arraste.alvo.metade },
        }
      }
      menuDaLinha={menuDaLinha}
      alta={(tipo) => seloDoTipo(tipo) !== null || origens.has(tipo.id)}
    />
  );
}
