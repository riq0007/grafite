// Os logs pelo painel (change painel-da-operacao, design, decisão 9): as últimas linhas do log de
// cada serviço da instalação, com a busca por um texto. No Windows, cada arquivo do WinSW aparece
// à parte; no Linux, o log do contêiner.
import { CampoDeTexto, ControleSegmentado, GrupoDeRadios, Radio, Segmento } from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ApiDoPainel, EstadoDoPainel } from '../api/tipos.ts';
import estilos from './Logs.module.css';

const QUANTAS = ['100', '500', '2000'] as const;

export function Logs({ api, estado }: { api: ApiDoPainel; estado: EstadoDoPainel }) {
  const [servico, setServico] = useState(estado.servicos[0]?.id ?? '');
  const [linhas, setLinhas] = useState<(typeof QUANTAS)[number]>('100');
  const [busca, setBusca] = useState('');
  const log = useQuery({
    queryKey: ['logs', servico, linhas, busca.trim()],
    queryFn: () => api.logs(servico, Number(linhas), busca.trim() || undefined),
    enabled: servico !== '',
  });
  const nome = estado.servicos.find(({ id }) => id === servico)?.nome ?? servico;
  return (
    <div className={estilos.tela}>
      <div className={estilos.filtros}>
        <GrupoDeRadios rotulo="Serviço" value={servico} onChange={setServico}>
          {estado.servicos.map(({ id, nome: doServico }) => (
            <Radio key={id} value={id}>
              {doServico}
            </Radio>
          ))}
        </GrupoDeRadios>
        <CampoDeTexto
          rotulo="Buscar no log"
          type="search"
          descricao="Só as linhas com o texto, sem diferença de maiúsculas."
          value={busca}
          onChange={setBusca}
        />
        <ControleSegmentado
          rotulo="Últimas linhas"
          value={linhas}
          onChange={(valor) => setLinhas(valor as (typeof QUANTAS)[number])}
        >
          {QUANTAS.map((quantas) => (
            <Segmento key={quantas} value={quantas}>
              {Number(quantas).toLocaleString('pt-BR')}
            </Segmento>
          ))}
        </ControleSegmentado>
      </div>
      <section className={estilos.log} aria-label={`Log do ${nome}`}>
        {log.isPending && <p className={estilos.nota}>Lendo o log.</p>}
        {log.isError && <p role="alert">{log.error.message}</p>}
        {log.data?.length === 0 && (
          <p className={estilos.nota}>O serviço ainda não escreveu nenhum log.</p>
        )}
        {log.data?.map(({ origem, linhas: lidas }) => (
          <div key={origem} className={estilos.arquivo}>
            <h2 className={estilos.mono}>{origem}</h2>
            {lidas.length === 0 ? (
              <p className={estilos.nota}>
                {busca.trim() ? 'Nenhuma linha com o texto.' : 'Nenhuma linha.'}
              </p>
            ) : (
              <ol className={estilos.linhas}>
                {lidas.map((linha, numero) => (
                  // As linhas do log não mudam de lugar: a ordem delas é a do arquivo.
                  // biome-ignore lint/suspicious/noArrayIndexKey: a posição é a da linha no log lido.
                  <li key={numero}>{linha}</li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
