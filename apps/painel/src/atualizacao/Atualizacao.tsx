// A atualização pelo painel (spec painel-da-operacao, "Tarefas do painel pelos mesmos comandos"): o
// pacote escolhido entre os das pastas de Downloads e de C:\Temp, no Windows, ou digitado, e o
// ambiente, com o teste proposto antes da produção. A tarefa é o mesmo atualizar do comando: ela
// recusa na produção a versão que não roda no teste e, antes de mudar qualquer coisa, faz o backup
// e pede o nome do banco da produção digitado.
import {
  Botao,
  CampoDeTexto,
  ControleSegmentado,
  formatarTamanho,
  GrupoDeRadios,
  Radio,
  Segmento,
} from '@grafite/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ApiDoPainel, EstadoDoPainel } from '../api/tipos.ts';
import { AMBIENTE_COM_ARTIGO, formatarMomento } from '../formatos.ts';
import { useTarefas } from '../tarefas/pedirTarefa.tsx';
import estilos from './Atualizacao.module.css';

const OUTRO = 'outro';

export function Atualizacao({ api, estado }: { api: ApiDoPainel; estado: EstadoDoPainel }) {
  const { pedir, emAndamento } = useTarefas();
  const pacotes = useQuery({ queryKey: ['pacotes'], queryFn: () => api.pacotes() });
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [digitado, setDigitado] = useState('');
  const [ambienteEscolhido, setAmbienteEscolhido] = useState<'producao' | 'teste' | null>(null);

  const lista = pacotes.data ?? [];
  const caminho = escolhido ?? lista[0]?.caminho ?? OUTRO;
  const pacote = lista.find((candidato) => candidato.caminho === caminho);
  // A versão nova vai primeiro ao teste: a produção é a proposta só quando o teste já a roda.
  const proposto =
    pacote !== undefined && pacote.versao === estado.ambientes.teste.atual ? 'producao' : 'teste';
  const ambiente = ambienteEscolhido ?? proposto;
  const zip = caminho === OUTRO ? digitado.trim() : caminho;

  const atualizar = () => {
    setAmbienteEscolhido(null);
    void pedir('atualizar', { zip, ambiente });
  };

  return (
    <div className={estilos.tela}>
      <p className={estilos.nota}>
        A versão nova vai primeiro ao teste. A produção só recebe a versão que já roda no teste:
        antes de mudar qualquer coisa, ela faz o backup e pede o nome do banco da produção digitado.
        Teste: {estado.ambientes.teste.atual ?? 'sem versão'}. Produção:{' '}
        {estado.ambientes.producao.atual ?? 'sem versão'}.
      </p>
      <GrupoDeRadios rotulo="Pacote da versão" value={caminho} onChange={setEscolhido}>
        {lista.map((candidato) => (
          <Radio key={candidato.caminho} value={candidato.caminho}>
            <span className={estilos.opcao}>
              <span className={estilos.mono}>{candidato.nome}</span>
              <span className={estilos.detalhe}>
                Versão {candidato.versao} · {formatarTamanho(candidato.tamanho)} · de{' '}
                {formatarMomento(candidato.modificadoEm)} · {candidato.caminho}
              </span>
            </span>
          </Radio>
        ))}
        <Radio value={OUTRO}>Outro pacote</Radio>
      </GrupoDeRadios>
      {lista.length === 0 && !pacotes.isPending && (
        <p className={estilos.nota}>
          {estado.plataforma === 'windows'
            ? 'Nenhum pacote nas pastas de Downloads e de C:\\Temp: digite o caminho dele.'
            : 'Digite o caminho do pacote no servidor.'}
        </p>
      )}
      {caminho === OUTRO && (
        <CampoDeTexto
          rotulo="Caminho do pacote"
          descricao="O zip ou o tar da versão, com o .sha256 ao lado, como a release os publica."
          value={digitado}
          onChange={setDigitado}
        />
      )}
      <ControleSegmentado
        rotulo="Ambiente"
        value={ambiente}
        onChange={(valor) => setAmbienteEscolhido(valor as 'producao' | 'teste')}
      >
        <Segmento value="teste">Teste</Segmento>
        <Segmento value="producao">Produção</Segmento>
      </ControleSegmentado>
      <div className={estilos.acoes}>
        <Botao nivel="primario" isDisabled={emAndamento !== null || zip === ''} onPress={atualizar}>
          {`Atualizar ${AMBIENTE_COM_ARTIGO[ambiente]}`}
        </Botao>
      </div>
    </div>
  );
}
