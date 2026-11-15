// O passo Conferir do assistente da distribuição (spec distribuicao-de-software, "Distribuição às
// máquinas"; change software-por-pacote, m05): o que vai acontecer com cada grupo de máquinas antes
// do envio. As que vão instalar, pela versão de hoje; as puladas, que já têm a versão-alvo; e as sem
// contato, que entram na fila e saem da lista por um botão.
import { explicarOComando, versaoCortada } from '@grafite/domain';
import { Botao, CabecalhoDaPagina, RotuloDeSituacao, type Situacao } from '@grafite/ui';
import { type ReactNode, useId } from 'react';
import estilos from './Assistente.module.css';
import type { MaquinaDaPrevia, PacoteDeSoftware, PreviaDaDistribuicao } from './consultas.ts';
import { nomeComVersao, plural } from './formatos.ts';

/** Até quantas máquinas cada grupo mostra pelo nome; as outras viram "e mais N". */
const MAQUINAS_A_VISTA = 40;

export function PassoDeConferir({
  pacote,
  previa,
  quandoInstalam,
  aoTirarDaLista,
}: {
  pacote: PacoteDeSoftware;
  previa: PreviaDaDistribuicao;
  /** "agora", "hoje à noite", "amanhã" ou "qui 12/11", para o rótulo das que vão instalar. */
  quandoInstalam: string;
  aoTirarDaLista: (maquinas: readonly MaquinaDaPrevia[]) => void;
}) {
  const { resumo } = explicarOComando(pacote.comando);
  const daClasse = (classe: MaquinaDaPrevia['classe']) =>
    previa.maquinas.filter((maquina) => maquina.classe === classe);
  const vaoInstalar = daClasse('vai-instalar');
  const puladas = daClasse('pulada');
  const naFila = daClasse('na-fila');
  const [semContato] = naFila;
  const uma = (lista: readonly unknown[]) => lista.length === 1;
  return (
    <>
      <CabecalhoDaPagina
        titulo="Confira antes de enviar"
        detalhe="O que vai acontecer com cada grupo de máquinas."
      />
      {previa.maquinas.length === 0 ? (
        <p className={estilos.nota}>Nenhuma máquina na lista. Volte ao passo Máquinas.</p>
      ) : (
        <div className={estilos.grupos}>
          {vaoInstalar.length > 0 && (
            <Grupo
              numero={vaoInstalar.length}
              situacao="sucesso"
              titulo={`${uma(vaoInstalar) ? 'vai instalar' : 'vão instalar'} o ${nomeComVersao(pacote)}`}
              rotulo={`${uma(vaoInstalar) ? 'Instala' : 'Instalam'} ${quandoInstalam}`}
              descricao={`${uma(vaoInstalar) ? 'Instala sozinha' : 'Instalam sozinhas'}${resumo ? `, ${resumo}` : ''}.`}
            >
              {porVersaoDeHoje(vaoInstalar, pacote.versao).map(({ versao, maquinas }) => {
                const texto = versao
                  ? `${uma(maquinas) ? 'Atualiza' : 'Atualizam'} da ${versao}`
                  : `${uma(maquinas) ? 'Instala' : 'Instalam'} pela primeira vez`;
                return (
                  <div key={versao ?? ''}>
                    <p className={estilos.subgrupo}>
                      <span className={estilos.legendaForte}>{texto}</span>
                      <b>{maquinas.length}</b>
                    </p>
                    <Maquinas maquinas={maquinas} rotulo={`Máquinas que ${texto.toLowerCase()}`} />
                  </div>
                );
              })}
            </Grupo>
          )}
          {puladas.length > 0 && (
            <Grupo
              numero={puladas.length}
              situacao="neutra"
              titulo={
                uma(puladas)
                  ? `já tem ${pacote.versao ? `a ${pacote.versao}` : 'o pacote'} e será pulada`
                  : `já têm ${pacote.versao ? `a ${pacote.versao}` : 'o pacote'} e serão puladas`
              }
              rotulo={uma(puladas) ? 'Nada muda nela' : 'Nada muda nelas'}
              descricao="A versão é confirmada no próximo inventário."
            >
              <Maquinas maquinas={puladas} rotulo="Máquinas puladas" tipo="pulada" />
            </Grupo>
          )}
          {semContato && (
            <Grupo
              numero={naFila.length}
              situacao="atencao"
              titulo={
                uma(naFila)
                  ? `sem contato: ${semContato.rotulo} entra na fila`
                  : 'sem contato: entram na fila'
              }
              rotulo={uma(naFila) ? 'Instala quando voltar' : 'Instalam quando voltarem'}
              descricao={
                uma(naFila)
                  ? `Sem sinal${semContato.semContato ? ` há ${plural(semContato.semContato.dias, 'dia', 'dias')}` : ''}. Você pode tirá-la da lista agora.`
                  : 'Sem sinal do agente. Você pode tirá-las da lista agora.'
              }
            >
              <Maquinas maquinas={naFila} rotulo="Máquinas sem contato" tipo="fila" />
              <Botao
                nivel="terciario"
                onPress={() => aoTirarDaLista(naFila)}
                className={estilos.acaoDoGrupo}
              >
                {uma(naFila) ? 'Tirar da lista' : `Tirar as ${naFila.length} da lista`}
              </Botao>
            </Grupo>
          )}
        </div>
      )}
    </>
  );
}

/** As que vão instalar pela versão de hoje, cortada no tamanho da versão-alvo, da mais nova para a
 * mais velha; as sem o programa, no fim. */
function porVersaoDeHoje(maquinas: readonly MaquinaDaPrevia[], versaoAlvo: string | null) {
  const grupos = new Map<string | null, MaquinaDaPrevia[]>();
  for (const maquina of maquinas) {
    const versao = versaoCortada(maquina.versao, versaoAlvo);
    grupos.set(versao, [...(grupos.get(versao) ?? []), maquina]);
  }
  return [...grupos]
    .map(([versao, doGrupo]) => ({ versao, maquinas: doGrupo }))
    .sort((a, b) => {
      if (a.versao === null) return 1;
      if (b.versao === null) return -1;
      return b.versao.localeCompare(a.versao, 'pt-BR', { numeric: true });
    });
}

function Grupo({
  numero,
  situacao,
  titulo,
  rotulo,
  descricao,
  children,
}: {
  numero: number;
  situacao: Situacao;
  titulo: string;
  rotulo: string;
  descricao: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={estilos.grupo} aria-labelledby={id}>
      <span className={estilos.numeroDoGrupo} data-situacao={situacao} aria-hidden="true">
        {numero}
      </span>
      <div className={estilos.corpoDoGrupo}>
        <h2 id={id} className={estilos.tituloDoGrupo}>
          <span>
            <span className={estilos.oculto}>{numero} </span>
            {titulo}
          </span>
          <RotuloDeSituacao situacao={situacao} semIcone>
            {rotulo}
          </RotuloDeSituacao>
        </h2>
        <p className={estilos.descricaoDoGrupo}>{descricao}</p>
        {children}
      </div>
    </section>
  );
}

function Maquinas({
  maquinas,
  rotulo,
  tipo,
}: {
  maquinas: readonly MaquinaDaPrevia[];
  rotulo: string;
  tipo?: 'pulada' | 'fila';
}) {
  const alem = maquinas.length - MAQUINAS_A_VISTA;
  return (
    <ul className={estilos.chips} aria-label={rotulo}>
      {maquinas.slice(0, MAQUINAS_A_VISTA).map((maquina) => (
        <li key={maquina.id} className={estilos.chip} data-tipo={tipo}>
          <span className={estilos.mono}>{maquina.rotulo}</span>
        </li>
      ))}
      {alem > 0 && <li className={estilos.maisChips}>e mais {alem}</li>}
    </ul>
  );
}
