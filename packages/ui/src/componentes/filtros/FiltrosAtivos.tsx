import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button, Group } from 'react-aria-components';
import { BotaoDeIcone } from '../../icones/Icone.tsx';
import { Botao } from '../botao/Botao.tsx';
import { Popover } from '../flutuante/Popover.tsx';
import estilos from './FiltrosAtivos.module.css';

export interface FiltroAtivo {
  id: string;
  /** O nome do filtro, como "Local". */
  rotulo: string;
  /** O operador, quando a coluna tem mais de um, como "contém". */
  operador?: string;
  /** O valor escolhido, como "Jundiaí". */
  valor: string;
}

export interface PropsDosFiltrosAtivos {
  filtros: FiltroAtivo[];
  aoLimpar: (id: string) => void;
  aoLimparTodos: () => void;
  /**
   * O editor do filtro, que abre num popover preso ao rótulo dele, com o que o fecha; sem ele, os
   * rótulos são só texto.
   */
  editor?: (id: string, fechar: () => void) => ReactNode;
  className?: string;
}

/** O operador e o valor, como o nome dos botões os diz: "contém almox". */
const condicao = (filtro: FiltroAtivo) =>
  filtro.operador ? `${filtro.operador} ${filtro.valor}` : filtro.valor;

/** O que o filtro faz, em texto: "Hostname · contém · almox". */
function Descricao({ filtro }: { filtro: FiltroAtivo }) {
  const separador = (
    <span aria-hidden="true" className={estilos.separador}>
      {' · '}
    </span>
  );
  return (
    <>
      <span className={estilos.nome}>{filtro.rotulo}</span>
      {separador}
      {filtro.operador && (
        <>
          <span className={estilos.operador}>{filtro.operador}</span>
          {separador}
        </>
      )}
      <span className={estilos.valor}>{filtro.valor}</span>
    </>
  );
}

/**
 * Os filtros ativos de uma lista, cada um com o nome, o operador, o valor e o botão de limpar, e
 * "Limpar filtros". Com o editor, o rótulo abre o editor do filtro preso a ele, e Backspace com o
 * foco nele o limpa (change filtros-e-barra-da-tabela, design, decisão 3). Sem filtro ativo, a linha
 * some; quem usa leva o foco ao campo de filtro.
 */
export function FiltrosAtivos({
  filtros,
  aoLimpar,
  aoLimparTodos,
  editor,
  className,
}: PropsDosFiltrosAtivos) {
  const linha = useRef<HTMLDivElement>(null);
  // O filtro limpo, onde ele estava e por qual controle: o controle sai da linha, e o foco iria
  // junto; ele vai ao mesmo controle do filtro que ficou no lugar.
  const limpo = useRef<{ id: string; posicao: number; controle: 'limpar' | 'editar' } | null>(null);
  const [editando, definirEditando] = useState<string | null>(null);
  const ancora = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const pendente = limpo.current;
    if (!pendente || filtros.some((filtro) => filtro.id === pendente.id)) return;
    limpo.current = null;
    if (linha.current?.contains(document.activeElement)) return;
    const controles =
      linha.current?.querySelectorAll<HTMLElement>(`[data-${pendente.controle}]`) ?? [];
    controles[Math.min(pendente.posicao, controles.length - 1)]?.focus();
  }, [filtros]);

  if (filtros.length === 0) return null;
  const limpar = (filtro: FiltroAtivo, posicao: number, controle: 'limpar' | 'editar') => {
    limpo.current = { id: filtro.id, posicao, controle };
    aoLimpar(filtro.id);
  };
  const emEdicao = filtros.find((filtro) => filtro.id === editando);
  return (
    <Group
      ref={linha}
      aria-label="Filtros ativos"
      className={[estilos.filtros, className].filter(Boolean).join(' ')}
    >
      <ul className={estilos.lista}>
        {filtros.map((filtro, posicao) => (
          <li key={filtro.id} className={estilos.filtro}>
            {editor ? (
              <Button
                aria-label={`Editar o filtro ${filtro.rotulo}: ${condicao(filtro)}`}
                data-editar=""
                className={estilos.editar}
                onPress={(evento) => {
                  ancora.current = evento.target as HTMLElement;
                  definirEditando(filtro.id);
                }}
                onKeyDown={(evento) => {
                  if (evento.key !== 'Backspace' && evento.key !== 'Delete') return;
                  evento.preventDefault();
                  limpar(filtro, posicao, 'editar');
                }}
              >
                <Descricao filtro={filtro} />
              </Button>
            ) : (
              <span className={estilos.texto}>
                <Descricao filtro={filtro} />
              </span>
            )}
            <BotaoDeIcone
              icone={X}
              rotulo={`Limpar o filtro ${filtro.rotulo}: ${condicao(filtro)}`}
              data-limpar
              onPress={() => limpar(filtro, posicao, 'limpar')}
            />
          </li>
        ))}
      </ul>
      <Botao nivel="terciario" onPress={aoLimparTodos}>
        Limpar filtros
      </Botao>
      {editor && emEdicao && (
        <Popover
          titulo={`Filtro de ${emEdicao.rotulo}`}
          ocultarTitulo
          ancora={ancora}
          aberto
          aoMudarAberto={(aberto) => {
            if (!aberto) definirEditando(null);
          }}
        >
          {editor(emEdicao.id, () => definirEditando(null))}
        </Popover>
      )}
    </Group>
  );
}
