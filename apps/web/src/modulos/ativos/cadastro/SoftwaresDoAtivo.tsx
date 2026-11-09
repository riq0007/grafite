import { normalizarTexto } from '@grafite/domain';
import {
  Botao,
  CabecalhoDaTabela,
  CampoDeTexto,
  Celula,
  Coluna,
  CorpoDaTabela,
  EstadoVazio,
  Linha,
  Tabela,
  useDataHora,
} from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { consultar } from '../../../api/consultas.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from '../Ativos.module.css';
import { chaveDoAtivo } from '../consultas.ts';
import { DistribuicoesDoAtivo } from '../software/DistribuicoesDoAtivo.tsx';
import estilosDoSoftware from '../software/Software.module.css';

const NUMERO = new Intl.NumberFormat('pt-BR');

/** "2024-03-02" como "02/03/2024", sem passar pelo fuso: a data do agente não tem hora. */
const dataDoAgente = (data: string) => data.split('-').reverse().join('/');

const contagem = (vistos: number, total: number) => {
  const nome = total === 1 ? 'software' : 'softwares';
  return vistos === total
    ? `${NUMERO.format(total)} ${nome}`
    : `${NUMERO.format(vistos)} de ${NUMERO.format(total)} ${nome}`;
};

/**
 * A aba Softwares da ficha do ativo (spec inventario-pelo-agente, "Softwares na ficha do ativo"): os
 * softwares instalados do último inventário do agente do GLPI e, depois, as distribuições de software
 * para a máquina (change distribuicao-de-software).
 */
export function SoftwaresDoAtivo({ ativoId }: { ativoId: string }) {
  return (
    <div className={estilosDoSoftware.partes}>
      <SoftwaresInstalados ativoId={ativoId} />
      <DistribuicoesDoAtivo ativoId={ativoId} />
    </div>
  );
}

/**
 * Os softwares instalados do último inventário do agente do GLPI, em ordem de nome, com a busca pelo
 * nome ou pelo editor, quantos são e a data do inventário.
 */
function SoftwaresInstalados({ ativoId }: { ativoId: string }) {
  const api = useApi();
  const dataHora = useDataHora();
  const [busca, definirBusca] = useState('');
  const softwares = useQuery({
    queryKey: [...chaveDoAtivo(ativoId), 'softwares'],
    queryFn: () =>
      consultar(
        () => api.GET('/ativos/{id}/softwares', { params: { path: { id: ativoId } } }),
        'carregar os softwares',
      ),
  });
  if (softwares.isPending) {
    return (
      <p role="status" className={estilos.contagem}>
        Carregando os softwares…
      </p>
    );
  }
  if (softwares.isError) {
    return (
      <EstadoVazio
        titulo={softwares.error.message}
        acao={<Botao onPress={() => void softwares.refetch()}>Tentar de novo</Botao>}
      />
    );
  }
  const { softwares: lista, inventariadoEm } = softwares.data;
  if (lista.length === 0) {
    return (
      <EstadoVazio
        titulo="O agente do GLPI ainda não mandou a lista dos softwares desta máquina."
        descricao="A lista chega com o inventário do agente ligado a este ativo, em Administração › Agentes."
      />
    );
  }
  const termo = normalizarTexto(busca.trim());
  const vistos = termo
    ? lista.filter((software) =>
        normalizarTexto(`${software.nome} ${software.editor ?? ''}`).includes(termo),
      )
    : lista;
  return (
    <section className={estilos.parte} aria-labelledby="softwares-do-ativo">
      <h2 id="softwares-do-ativo" className={estilos.tituloDaParte}>
        Softwares instalados
      </h2>
      {inventariadoEm && (
        <p className={estilos.informacao}>
          {`Do inventário do agente do GLPI em ${dataHora.formatarDataEHora(new Date(inventariadoEm))}.`}
        </p>
      )}
      <CampoDeTexto
        rotulo="Buscar software"
        descricao="Pelo nome ou pelo editor."
        autoComplete="off"
        value={busca}
        onChange={definirBusca}
      />
      <p role="status" className={estilos.contagem}>
        {contagem(vistos.length, lista.length)}
      </p>
      <Tabela rotulo="Softwares instalados">
        <CabecalhoDaTabela>
          <Coluna id="nome" principal>
            Nome
          </Coluna>
          <Coluna id="versao" especie="codigo">
            Versão
          </Coluna>
          <Coluna id="editor">Editor</Coluna>
          <Coluna id="instalado" especie="data">
            Instalado em
          </Coluna>
        </CabecalhoDaTabela>
        <CorpoDaTabela
          itens={vistos.map((software, indice) => ({
            ...software,
            id: `${indice}-${software.nome}`,
          }))}
          vazio={<EstadoVazio titulo="Nenhum software com essa busca." />}
        >
          {(software) => (
            <Linha id={software.id}>
              <Celula>{software.nome}</Celula>
              <Celula>{software.versao ?? '—'}</Celula>
              <Celula>{software.editor ?? '—'}</Celula>
              <Celula>{software.instaladoEm ? dataDoAgente(software.instaladoEm) : '—'}</Celula>
            </Linha>
          )}
        </CorpoDaTabela>
      </Tabela>
    </section>
  );
}
