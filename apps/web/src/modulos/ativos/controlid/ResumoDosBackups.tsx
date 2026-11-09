// O resumo dos backups do Control iD na web (spec backup-do-control-id, "Histórico dos backups" e
// "Resumo dos backups por controle"; change suprimentos-rostos-e-backups, design, decisão 7): na
// ficha, os rostos e os usuários com a variação, a tendência dos rostos e a faixa dos dias; na tela
// dos backups, os últimos dias de cada controle, com quem tem mais dias sem backup primeiro.
import type { components } from '@grafite/api-client';
import {
  CabecalhoDaTabela,
  Celula,
  Coluna,
  Contagem,
  CorpoDaTabela,
  FaixaDeDias,
  formatarNumero,
  Linha,
  Tabela,
  Tendencia,
  useDataHora,
} from '@grafite/ui';
import estilos from './ResumoDosBackups.module.css';

export type ResumoDeUmControle = components['schemas']['ResumoDosBackups']['controles'][number];

/** A variação desde o backup anterior, quando os dois leram a categoria. */
function variacao(atual: number | null | undefined, anterior: number | null | undefined) {
  return atual !== null && atual !== undefined && anterior !== null && anterior !== undefined
    ? { variacao: { valor: atual - anterior, desde: 'o backup anterior' } }
    : {};
}

/** O resumo de um controle, no topo da seção Backups da ficha. */
export function ResumoDoControle({ resumo }: { resumo: ResumoDeUmControle }) {
  const { ultimo, anterior, dias, rostos } = resumo;
  const semValor = ultimo ? 'Sem dado' : 'Nenhum backup ainda';
  const periodo = `${dias.length} dias`;
  return (
    <div className={estilos.resumo}>
      <div className={estilos.contagens}>
        <Contagem
          rotulo="Rostos"
          valor={ultimo?.rostos ?? null}
          unidade="rostos"
          semValor={semValor}
          tinta="serie-1"
          {...variacao(ultimo?.rostos, anterior?.rostos)}
        />
        <Contagem
          rotulo="Usuários"
          valor={ultimo?.usuarios ?? null}
          semValor={semValor}
          {...variacao(ultimo?.usuarios, anterior?.usuarios)}
        />
        {rostos.length > 0 && (
          <Tendencia
            rotulo="Rostos"
            pontos={rostos}
            unidade="rostos"
            periodo={periodo}
            tinta="serie-1"
            semNumero
          />
        )}
      </div>
      <FaixaDeDias rotulo={`Backups dos últimos ${periodo}`} dias={dias} oQue="backup" />
    </div>
  );
}

const diasSemBackup = (resumo: ResumoDeUmControle) =>
  resumo.dias.filter((dia) => dia.situacao === 'nada').length;

/** Os últimos dias de cada controle, na tela "Backups do Control iD". */
export function UltimosDias({ controles }: { controles: ResumoDeUmControle[] }) {
  const { formatarDataEHora } = useDataHora();
  const dias = controles[0]?.dias.length ?? 30;
  const emOrdem = [...controles].sort(
    (a, b) =>
      diasSemBackup(b) - diasSemBackup(a) ||
      a.controle.rotulo.localeCompare(b.controle.rotulo, 'pt-BR'),
  );
  // A tabela base, com a espécie de cada coluna, como as outras (change tabelas-consistentes).
  return (
    <Tabela rotulo={`Últimos ${dias} dias`}>
      <CabecalhoDaTabela>
        <Coluna id="controle" principal>
          Controle
        </Coluna>
        <Coluna id="backups">Backups</Coluna>
        <Coluna id="rostos" especie="numero">
          Rostos
        </Coluna>
        <Coluna id="usuarios" especie="numero">
          Usuários
        </Coluna>
        <Coluna id="ultimo" especie="data">
          Último backup
        </Coluna>
      </CabecalhoDaTabela>
      <CorpoDaTabela itens={emOrdem.map((resumo) => ({ ...resumo, id: resumo.controle.id }))}>
        {(resumo) => (
          <Linha id={resumo.id}>
            <Celula>
              <span className={estilos.nome}>{resumo.controle.rotulo}</span>
              {resumo.controle.patrimonio && (
                <span className={`mono ${estilos.patrimonio}`}>{resumo.controle.patrimonio}</span>
              )}
            </Celula>
            <Celula>
              <FaixaDeDias
                rotulo={`Backups de ${resumo.controle.rotulo}`}
                dias={resumo.dias}
                oQue="backup"
              />
            </Celula>
            <Celula>
              {resumo.ultimo?.rostos != null ? formatarNumero(resumo.ultimo.rostos) : '—'}
            </Celula>
            <Celula>
              {resumo.ultimo?.usuarios != null ? formatarNumero(resumo.ultimo.usuarios) : '—'}
            </Celula>
            <Celula>
              {resumo.ultimo ? formatarDataEHora(new Date(resumo.ultimo.concluidoEm)) : 'Nenhum'}
            </Celula>
          </Linha>
        )}
      </CorpoDaTabela>
    </Tabela>
  );
}
