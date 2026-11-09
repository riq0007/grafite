// A distribuição de um pacote às máquinas (spec distribuicao-de-software, "Distribuição às
// máquinas"; change distribuicao-de-software, design, decisão 6), numa gaveta: o pacote, a busca
// das máquinas com o agente do GLPI ligado, nos locais em que a conta distribui, e as escolhidas,
// que ficam entre uma busca e outra. A distribuição criada abre na ficha dela.
import {
  avisar,
  Botao,
  CampoDeTexto,
  Checkbox,
  Gaveta,
  MensagemDoPasso,
  Selecao,
  useDataHora,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import {
  CHAVE_DO_SOFTWARE,
  type MaquinaParaDistribuir,
  type PacoteDeSoftware,
  useMaquinasParaDistribuir,
} from './consultas.ts';
import estilos from './Software.module.css';

/** Quanto a busca espera a digitação parar. */
const ESPERA_DA_BUSCA = 300;

const nomeDaMaquina = (maquina: Pick<MaquinaParaDistribuir, 'rotulo' | 'patrimonio'>) =>
  maquina.patrimonio ? `${maquina.rotulo} (${maquina.patrimonio})` : maquina.rotulo;

const rotuloDoPacote = (pacote: Pick<PacoteDeSoftware, 'nome' | 'versao'>) =>
  pacote.versao && !pacote.nome.includes(pacote.versao)
    ? `${pacote.nome} ${pacote.versao}`
    : pacote.nome;

export function Distribuir({
  pacote,
  pacotes,
  aoFechar,
}: {
  /** O pacote da linha; sem ele, a gaveta pede para escolher entre os ativos. */
  pacote: PacoteDeSoftware | null;
  pacotes: readonly PacoteDeSoftware[];
  aoFechar: () => void;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  const { formatarDataEHora } = useDataHora();
  const [pacoteId, definirPacoteId] = useState<string | null>(pacote?.id ?? null);
  const [busca, definirBusca] = useState('');
  const [buscada, definirBuscada] = useState('');
  const [escolhidas, definirEscolhidas] = useState<Map<string, MaquinaParaDistribuir>>(new Map());
  const [falha, definirFalha] = useState<string | null>(null);
  const [vez, definirVez] = useState(0);
  const [enviando, definirEnviando] = useState(false);
  const maquinas = useMaquinasParaDistribuir(buscada);
  const ativos = pacotes.filter((um) => um.situacao === 'ativo');

  useEffect(() => {
    const espera = setTimeout(() => definirBuscada(busca.trim()), ESPERA_DA_BUSCA);
    return () => clearTimeout(espera);
  }, [busca]);

  const achadas = maquinas.data?.maquinas ?? [];
  const alternar = (maquina: MaquinaParaDistribuir, escolhida: boolean) =>
    definirEscolhidas((antes) => {
      const depois = new Map(antes);
      if (escolhida) depois.set(maquina.id, maquina);
      else depois.delete(maquina.id);
      return depois;
    });
  const recusar = (texto: string) => {
    definirFalha(texto);
    definirVez((anterior) => anterior + 1);
  };

  async function distribuir() {
    if (!pacoteId) {
      recusar('Escolha o pacote.');
      return;
    }
    definirEnviando(true);
    const resultado = await pedir(
      () =>
        api.POST('/software/distribuicoes', {
          body: { pacoteId, ativoIds: [...escolhidas.keys()] },
        }),
      'distribuir o pacote',
    );
    definirEnviando(false);
    if ('erro' in resultado) {
      const { campos } = recusaDe<'ativoIds' | 'pacoteId'>(resultado);
      recusar(campos?.ativoIds ?? campos?.pacoteId ?? resultado.erro);
      return;
    }
    const quantas = resultado.dados.maquinas;
    avisar({
      situacao: 'sucesso',
      titulo: `Distribuição criada para ${quantas} ${quantas === 1 ? 'máquina' : 'máquinas'}.`,
    });
    await consultas.invalidateQueries({ queryKey: CHAVE_DO_SOFTWARE });
    aoFechar();
    await navegar({
      to: '/gestao/software/distribuicoes/$id',
      params: { id: resultado.dados.id },
    });
  }

  const total = escolhidas.size;
  const naoEscolhidas = achadas.filter((maquina) => !escolhidas.has(maquina.id));
  return (
    <Gaveta
      aberta
      aoMudarAberta={(aberta) => {
        if (!aberta && !enviando) aoFechar();
      }}
      titulo={pacote ? `Distribuir ${rotuloDoPacote(pacote)}` : 'Nova distribuição'}
    >
      <div className={estilos.formulario}>
        {pacote ? (
          <p className={estilos.nota}>
            {`O agente do GLPI de cada máquina baixa ${pacote.arquivo ? `o ${pacote.arquivo.nome}` : 'o pacote'} e roda o comando como o sistema.`}
          </p>
        ) : (
          <Selecao
            rotulo="Pacote"
            obrigatorio
            opcoes={ativos.map((um) => ({ id: um.id, rotulo: rotuloDoPacote(um) }))}
            placeholder={ativos.length === 0 ? 'Nenhum pacote ativo na base' : 'Selecione'}
            selectedKey={pacoteId}
            onSelectionChange={(chave) => definirPacoteId(String(chave))}
          />
        )}
        <section className={estilos.secao} aria-label="Máquinas escolhidas">
          <h3>
            {total === 0
              ? 'Nenhuma máquina escolhida'
              : `${total} ${total === 1 ? 'máquina escolhida' : 'máquinas escolhidas'}`}
          </h3>
          {total > 0 && (
            <ul className={estilos.escolhidas}>
              {[...escolhidas.values()].map((maquina) => (
                <li key={maquina.id} className={estilos.escolhida}>
                  {nomeDaMaquina(maquina)}
                  <Botao
                    nivel="terciario"
                    aria-label={`Tirar ${nomeDaMaquina(maquina)}`}
                    onPress={() => alternar(maquina, false)}
                  >
                    Tirar
                  </Botao>
                </li>
              ))}
            </ul>
          )}
        </section>
        <CampoDeTexto
          rotulo="Procurar máquinas"
          type="search"
          value={busca}
          onChange={definirBusca}
          autoComplete="off"
          descricao="Pelo nome, pelo patrimônio, pela série ou pelo modelo. Só aparecem as máquinas com o agente do GLPI ligado."
        />
        {maquinas.isPending ? (
          <p role="status" className={estilos.nota}>
            Procurando as máquinas…
          </p>
        ) : maquinas.isError ? (
          <p className={estilos.nota}>{maquinas.error.message}</p>
        ) : achadas.length === 0 ? (
          <p role="status" className={estilos.nota}>
            {buscada
              ? 'Nenhuma máquina com o agente achada com esse texto.'
              : 'Nenhuma máquina com o agente do GLPI ligado nos seus locais. Ligue os agentes aos ativos em Administração › Agentes.'}
          </p>
        ) : (
          <>
            <div className={estilos.acoes}>
              <p role="status" className={estilos.nota}>
                {achadas.length === 1 ? '1 máquina achada' : `${achadas.length} máquinas achadas`}
              </p>
              {naoEscolhidas.length > 1 && (
                <Botao
                  nivel="terciario"
                  onPress={() => {
                    for (const maquina of naoEscolhidas) alternar(maquina, true);
                  }}
                >
                  {`Escolher as ${naoEscolhidas.length}`}
                </Botao>
              )}
            </div>
            <ul className={estilos.resultados} aria-label="Máquinas achadas">
              {achadas.map((maquina) => (
                <li key={maquina.id} className={estilos.resultado}>
                  <Checkbox
                    isSelected={escolhidas.has(maquina.id)}
                    onChange={(escolhida) => alternar(maquina, escolhida)}
                  >
                    {nomeDaMaquina(maquina)}
                  </Checkbox>
                  <p className={estilos.detalhe}>
                    {[
                      maquina.local ?? 'Sem local',
                      `agente ${maquina.agente.nome}`,
                      `último contato em ${formatarDataEHora(new Date(maquina.agente.ultimoContato))}`,
                    ].join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
        <MensagemDoPasso texto={falha} chave={vez} />
        <div className={estilos.rodape}>
          <Botao onPress={aoFechar} isDisabled={enviando}>
            Cancelar
          </Botao>
          <Botao
            nivel="primario"
            isDisabled={total === 0}
            carregando={enviando}
            rotuloCarregando="Distribuindo"
            onPress={() => void distribuir()}
          >
            {total === 0
              ? 'Distribuir'
              : `Distribuir para ${total} ${total === 1 ? 'máquina' : 'máquinas'}`}
          </Botao>
        </div>
      </div>
    </Gaveta>
  );
}
