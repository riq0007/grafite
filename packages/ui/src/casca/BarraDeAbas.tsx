import { Ellipsis } from 'lucide-react';
import { useState } from 'react';
import { Button } from 'react-aria-components';
import { Icone } from '../icones/Icone.tsx';
import estilos from './BarraDeAbas.module.css';
import { PainelDeBaixo } from './PainelDeBaixo.tsx';
import type { ModuloDaCasca } from './tipos.ts';

export interface PropsDaBarraDeAbas {
  modulos: readonly ModuloDaCasca[];
  atual: string | null;
  aoAbrirModulo: (id: string) => void;
}

const MAXIMO_DE_ABAS = 5;

const prioridade = ({ prioridadeNoCelular }: ModuloDaCasca) =>
  typeof prioridadeNoCelular === 'number' ? prioridadeNoCelular : Number.POSITIVE_INFINITY;

/** Módulos na ordem do celular: prioridade menor primeiro; no empate, a ordem do registro. */
export function ordenarParaOCelular(modulos: readonly ModuloDaCasca[]): ModuloDaCasca[] {
  return modulos
    .map((modulo, indice) => ({ modulo, indice }))
    .sort((a, b) => prioridade(a.modulo) - prioridade(b.modulo) || a.indice - b.indice)
    .map(({ modulo }) => modulo);
}

/**
 * Barra de abas do celular, no lugar do dock: até cinco módulos por prioridade, ou quatro e
 * "Mais", que lista os outros no painel que sobe de baixo. O módulo que pede fica sempre em
 * "Mais", depois dos que não couberam.
 */
export function BarraDeAbas({ modulos, atual, aoAbrirModulo }: PropsDaBarraDeAbas) {
  const [maisAberto, definirMaisAberto] = useState(false);
  const ordenados = ordenarParaOCelular(modulos);
  const candidatos = ordenados.filter((modulo) => modulo.prioridadeNoCelular !== 'mais');
  const sempreEmMais = ordenados.filter((modulo) => modulo.prioridadeNoCelular === 'mais');
  const cabemTodos = sempreEmMais.length === 0 && candidatos.length <= MAXIMO_DE_ABAS;
  const abas = cabemTodos ? candidatos : candidatos.slice(0, MAXIMO_DE_ABAS - 1);
  const restantes = cabemTodos ? [] : [...candidatos.slice(MAXIMO_DE_ABAS - 1), ...sempreEmMais];

  return (
    <nav aria-label="Módulos" className={estilos.barra} data-montagem="abas">
      {abas.map((modulo) => (
        <Button
          key={modulo.id}
          aria-label={modulo.nome}
          aria-current={modulo.id === atual ? 'page' : undefined}
          className={estilos.aba}
          onPress={() => aoAbrirModulo(modulo.id)}
        >
          <Icone icone={modulo.icone} tamanho={20} />
          <span className={estilos.nome} aria-hidden="true">
            {modulo.nome}
          </span>
        </Button>
      ))}
      {restantes.length > 0 && (
        <>
          <Button
            aria-label="Mais"
            aria-current={restantes.some((modulo) => modulo.id === atual) ? 'page' : undefined}
            className={estilos.aba}
            onPress={() => definirMaisAberto(true)}
          >
            <Icone icone={Ellipsis} tamanho={20} />
            <span className={estilos.nome} aria-hidden="true">
              Mais
            </span>
          </Button>
          <PainelDeBaixo
            titulo="Mais"
            aberto={maisAberto}
            aoMudarAberto={definirMaisAberto}
            itens={restantes.map((modulo) => ({ id: modulo.id, rotulo: modulo.nome }))}
            aoEscolher={aoAbrirModulo}
          />
        </>
      )}
    </nav>
  );
}
