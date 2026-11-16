// As peças comuns das telas do software (change software-por-pacote, design, decisão 4): o ícone do
// pacote, com o monograma na cor da série, o resultado de uma distribuição em rótulos e a barra em
// pedaços das situações.
import { monograma } from '@grafite/domain';
import { RotuloDeSituacao, type Situacao } from '@grafite/ui';
import type { DistribuicaoDoPacote } from './consultas.ts';
import { plural, serieDoPacote } from './formatos.ts';
import estilos from './Pecas.module.css';

/** O monograma do pacote, que o leitor de tela pula: o nome vem sempre ao lado. */
export function IconeDoPacote({
  nome,
  tamanho = 'normal',
}: {
  nome: string;
  tamanho?: 'p' | 'normal' | 'm' | 'gg';
}) {
  return (
    <span
      aria-hidden="true"
      className={estilos.icone}
      data-tamanho={tamanho === 'normal' ? undefined : tamanho}
      data-serie={serieDoPacote(nome)}
    >
      {monograma(nome)}
    </span>
  );
}

export type ResultadoDaDistribuicao = DistribuicaoDoPacote['resultado'];

/**
 * O resultado de uma distribuição em rótulos: "Todas concluídas", quando todas instalaram, ou um
 * rótulo por situação com máquinas. As sem contato saem das que aguardam e ganham o rótulo delas.
 * O compacto, da lista ao lado da distribuição aberta, mostra só o que precisa de alguém (as que
 * falharam e as sem contato), ou quantas já concluíram.
 */
export function RotulosDoResultado({
  maquinas,
  resultado,
  compacto = false,
}: {
  maquinas: number;
  resultado: ResultadoDaDistribuicao;
  compacto?: boolean;
}) {
  if (resultado.concluidas === maquinas) {
    return <RotuloDeSituacao situacao="sucesso">Todas concluídas</RotuloDeSituacao>;
  }
  if (compacto && resultado.falharam === 0 && resultado.semContato === 0) {
    return (
      <RotuloDeSituacao situacao="neutra" semIcone>
        {resultado.concluidas} de {maquinas} {maquinas === 1 ? 'concluída' : 'concluídas'}
      </RotuloDeSituacao>
    );
  }
  const rotulos: { situacao: Situacao; texto: string; quantidade: number }[] = [
    {
      situacao: 'sucesso',
      quantidade: resultado.concluidas,
      texto: plural(resultado.concluidas, 'concluída', 'concluídas'),
    },
    {
      situacao: 'info',
      quantidade: resultado.emAndamento,
      texto: `${resultado.emAndamento} instalando`,
    },
    {
      situacao: 'neutra',
      quantidade: resultado.aguardando - resultado.semContato,
      texto: `${resultado.aguardando - resultado.semContato} aguardando`,
    },
    {
      situacao: 'critico',
      quantidade: resultado.falharam,
      texto: `${resultado.falharam} ${resultado.falharam === 1 ? 'falhou' : 'falharam'}`,
    },
    {
      situacao: 'atencao',
      quantidade: resultado.semContato,
      texto: `${resultado.semContato} sem contato`,
    },
    {
      situacao: 'neutra',
      quantidade: resultado.tiradas,
      texto: `${plural(resultado.tiradas, 'tirada', 'tiradas')} da fila`,
    },
  ];
  const doCompacto = new Set<Situacao>(['critico', 'atencao']);
  return (
    <span className={estilos.resultado}>
      {rotulos
        .filter(
          ({ quantidade, situacao }) => quantidade > 0 && (!compacto || doCompacto.has(situacao)),
        )
        .map(({ situacao, texto }) => (
          <RotuloDeSituacao key={texto} situacao={situacao} semIcone>
            {texto}
          </RotuloDeSituacao>
        ))}
    </span>
  );
}

export type ParteDaBarra = 'ok' | 'atencao' | 'critico' | 'info' | 'neutra';

/**
 * A barra das situações, um pedaço por situação, na proporção de cada uma. É desenho: o número ou os
 * rótulos ao lado dizem o mesmo em texto.
 */
export function BarraDeSituacoes({
  partes,
  className,
}: {
  partes: readonly { parte: ParteDaBarra; quantidade: number }[];
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={[estilos.barra, className].filter(Boolean).join(' ')}>
      {partes.map(({ parte, quantidade }, indice) =>
        quantidade > 0 ? (
          // A mesma situação pode vir em dois pedaços, como as que aguardam e as tiradas.
          // biome-ignore lint/suspicious/noArrayIndexKey: os pedaços vêm sempre na mesma ordem.
          <i key={indice} data-parte={parte} style={{ flex: quantidade }} />
        ) : null,
      )}
    </span>
  );
}
