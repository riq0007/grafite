import { Botao, CabecalhoDaPagina, EscolhaDeArquivo, EstadoVazio, Selecao } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { SemPermissao } from '../../administracao/SemPermissao.tsx';
import estilosDosAtivos from '../Ativos.module.css';
import { useTipos } from '../consultas.ts';
import { CHAVE_DAS_IMPORTACOES, chaveDaImportacao, type Importacao } from './consultas.ts';
import estilos from './Importacao.module.css';

/** A planilha que a escolha oferece e recusa antes do envio, como a API confere. */
const PLANILHA = {
  formatos: ['.xlsx', '.csv'],
  limite: 10 * 1024 * 1024,
  regras: 'XLSX ou CSV, até 10 MB, com os títulos na primeira linha.',
} as const;

/**
 * A importação nova (spec importacao-de-ativos, "Planilha da importação"): o tipo dos ativos, entre
 * os ativos, e a planilha, enviada na hora, com o progresso. O envio cria o rascunho, e a tela dele
 * abre; a recusa da API aparece junto da escolha.
 */
export function ImportacaoNova() {
  const { pode } = useAcesso();
  const api = useApi();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  const tipos = useTipos();
  const [tipoId, definirTipoId] = useState<string | null>(null);
  const [progresso, definirProgresso] = useState<number | undefined>(undefined);
  const [erro, definirErro] = useState<string | null>(null);

  if (!pode('ativos.editar')) {
    return (
      <>
        <CabecalhoDaPagina titulo="Importar planilha" />
        <SemPermissao a="à importação de ativos" />
      </>
    );
  }
  if (tipos.error) {
    return (
      <>
        <CabecalhoDaPagina titulo="Importar planilha" />
        <EstadoVazio
          titulo={tipos.error.message}
          acao={<Botao onPress={() => void tipos.refetch()}>Tentar de novo</Botao>}
        />
      </>
    );
  }
  if (!tipos.data) {
    return (
      <>
        <CabecalhoDaPagina titulo="Importar planilha" />
        <p role="status" className={estilosDosAtivos.contagem}>
          Carregando os tipos…
        </p>
      </>
    );
  }
  const ativos = tipos.data.tipos.filter((tipo) => tipo.situacao === 'ativo');

  async function enviar(arquivo: File) {
    if (!tipoId) return;
    definirErro(null);
    definirProgresso(0);
    const consulta = new URLSearchParams({ tipoId, nome: arquivo.name });
    const resultado = await pedir(
      () =>
        api.enviarArquivo<Importacao>(
          `/ativos/importacoes?${consulta}`,
          arquivo,
          definirProgresso,
          'POST',
        ),
      'enviar a planilha',
    );
    definirProgresso(undefined);
    if ('erro' in resultado) {
      definirErro(resultado.erro);
      return;
    }
    consultas.setQueryData(chaveDaImportacao(resultado.dados.id), resultado.dados);
    void consultas.invalidateQueries({ queryKey: [...CHAVE_DAS_IMPORTACOES, 'lista'] });
    void navegar({
      to: '/gestao/importacoes/$id',
      params: { id: resultado.dados.id },
      replace: true,
    });
  }

  return (
    <div className={estilosDosAtivos.tela}>
      <CabecalhoDaPagina titulo="Importar planilha" />
      {ativos.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum tipo de ativo ainda."
          descricao="Quem cuida do catálogo cadastra os tipos de ativo antes da importação."
        />
      ) : (
        <div className={estilos.escolhas}>
          <Selecao
            rotulo="Tipo dos ativos"
            obrigatorio
            descricao="Uma planilha importa os ativos de um tipo."
            opcoes={ativos.map((tipo) => ({ id: tipo.id, rotulo: tipo.nome }))}
            selectedKey={tipoId}
            onSelectionChange={(chave) => definirTipoId(String(chave))}
            isDisabled={progresso !== undefined}
          />
          {tipoId && (
            <EscolhaDeArquivo
              rotulo="Planilha"
              rotuloAVista
              rotuloDoEnvio="Escolher planilha"
              {...PLANILHA}
              aoEscolher={(arquivo) => void enviar(arquivo)}
              progresso={progresso}
              erro={erro}
            />
          )}
        </div>
      )}
    </div>
  );
}
