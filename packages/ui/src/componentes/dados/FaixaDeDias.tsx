// A faixa de dias (spec visualizacao-de-dados, "Faixa de dias"; change visualizacoes-de-dados, design,
// decisão 5): um quadrado por dia, do mais antigo ao mais recente, com uma forma por situação, além
// da cor, e o resumo em texto ao lado.
import { type DiaDaFaixa, resumoDosDias } from './calculos.ts';
import estilos from './FaixaDeDias.module.css';

export interface PropsDaFaixaDeDias {
  /** O nome da lista para o leitor de tela, como "Backups dos últimos 30 dias". */
  rotulo: string;
  dias: DiaDaFaixa[];
  /** O que se conta, no resumo e no dia vazio: "26 de 30 dias com backup", "sem backup". */
  oQue: string;
}

/** "2026-10-29" → "29/10". */
const diaEMes = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

export function FaixaDeDias({ rotulo, dias, oQue }: PropsDaFaixaDeDias) {
  const emOrdem = [...dias].sort((a, b) => a.data.localeCompare(b.data));
  const texto = (dia: DiaDaFaixa) =>
    ({ ok: 'concluído', parcial: 'parcial', falha: 'falha', nada: `sem ${oQue}` })[dia.situacao];
  return (
    <div className={estilos.faixa}>
      <ul aria-label={rotulo} className={estilos.dias}>
        {emOrdem.map((dia) => {
          const legenda = `${diaEMes(dia.data)}: ${texto(dia)}`;
          return (
            <li
              key={dia.data}
              className={estilos.dia}
              data-situacao={dia.situacao}
              title={dia.detalhe ? `${legenda}. ${dia.detalhe}` : legenda}
            >
              {dia.situacao === 'falha' && <span className={estilos.x} data-parte="x" />}
              {dia.situacao === 'parcial' && <span className={estilos.meio} data-parte="meio" />}
              <span className={estilos.somenteLeitor}>{legenda}</span>
            </li>
          );
        })}
      </ul>
      <span className={estilos.resumo}>{resumoDosDias(emOrdem, oQue).texto}</span>
    </div>
  );
}
