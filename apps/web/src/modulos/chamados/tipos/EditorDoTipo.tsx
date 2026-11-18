// O editor do tipo (change chamados-da-ti, design, "A tela dos tipos (tarefa 5.19)"; m07): o
// cabeçalho com o tipo como está sendo escrito, as quatro seções e o pé, com "Descartar" e "Salvar
// o tipo". Quem guarda o que se escreve, grava e confere as recusas é a tela.
import {
  ICONES_DO_TIPO_DE_CHAMADO,
  type IconeDoTipoDeChamado,
  MODOS_DO_PRAZO,
  type ModoDoPrazo,
  rotuloDaUnidadeDoPrazo,
  UNIDADES_DO_PRAZO,
  type UnidadeDoPrazo,
} from '@grafite/domain';
import {
  Botao,
  CampoDeTexto,
  Carimbo,
  EscolhaDeIconeCompacta,
  GrupoDeRadios,
  Icone,
  Interruptor,
  MensagemDoPasso,
  NumeroNaFrase,
  type OpcaoDeIconeCompacta,
  type OpcaoDeSelecao,
  Radio,
  Selecao,
  SelecaoNaFrase,
} from '@grafite/ui';
import { CircleAlert, ListChecks } from 'lucide-react';
import { type ReactNode, type Ref, useId } from 'react';
import { ICONES_DOS_TIPOS_DE_CHAMADO, NOMES_DOS_ICONES_DOS_TIPOS } from '../icones.ts';
import { IconeDoTipo, Selo } from '../Pecas.tsx';
import {
  type ContaQueAtende,
  contagemDoTipo,
  type EdicaoDoTipo,
  NINGUEM,
  type NumeroDoPrazoNaEdicao,
  opcoesDeQuemAtende,
  type TipoDeChamado,
  trocarQuemAtende,
} from './edicao.ts';
import estilos from './Tipos.module.css';

/** Uma lista lida para uma escolha do editor: as opções e, quando a leitura falhou, o texto dela. */
export interface OpcoesLidas<T> {
  lista: readonly T[];
  falha: string | null;
}

export interface PropsDoEditorDoTipo {
  tipo: TipoDeChamado;
  edicao: EdicaoDoTipo;
  aoMudar: (edicao: EdicaoDoTipo) => void;
  /** As recusas que valem, nas chaves da tela. */
  erros: Readonly<Record<string, string>>;
  contas: OpcoesLidas<ContaQueAtende>;
  tiposDeAtivo: OpcoesLidas<OpcaoDeSelecao>;
  mudou: boolean;
  salvando: boolean;
  /** A falha sem recusa, antes dos botões, onde vai também a recusa geral; a chave muda a cada tentativa. */
  falha: { texto: string | null; chave: number };
  aoDescartar: () => void;
  aoSalvar: () => void;
  /** A área das seções, onde a tela procura o primeiro campo recusado. */
  area: Ref<HTMLDivElement>;
}

/** Os 16 ícones dos tipos, com o nome que o leitor de tela lê. */
const OPCOES_DE_ICONE: OpcaoDeIconeCompacta[] = ICONES_DO_TIPO_DE_CHAMADO.map((chave) => ({
  chave,
  rotulo: NOMES_DOS_ICONES_DOS_TIPOS[chave],
  icone: ICONES_DOS_TIPOS_DE_CHAMADO[chave],
}));

const COMO_CONTA: Record<ModoDoPrazo, string> = {
  horario: 'no horário da TI',
  corridas: 'em horas corridas',
};

const MODOS: OpcaoDeSelecao[] = MODOS_DO_PRAZO.map((modo) => ({
  id: modo,
  rotulo: COMO_CONTA[modo],
}));

/** As unidades na frase, como o número escrito as lê: "dias úteis" no horário da TI. */
function unidades(numero: NumeroDoPrazoNaEdicao, modo: ModoDoPrazo): OpcaoDeSelecao[] {
  const valor = Number(numero.valor) || 0;
  return UNIDADES_DO_PRAZO.map((unidade) => ({
    id: unidade,
    rotulo: rotuloDaUnidadeDoPrazo({ valor, unidade }, modo),
  }));
}

/** "Formulário: 6 campos", até o construtor (5.21) dar o "Editar os campos". */
function textoDoFormulario(campos: number): string {
  if (campos === 0) return 'Formulário: nenhum campo';
  return campos === 1 ? 'Formulário: 1 campo' : `Formulário: ${campos} campos`;
}

export function EditorDoTipo({
  tipo,
  edicao,
  aoMudar,
  erros,
  contas,
  tiposDeAtivo,
  mudou,
  salvando,
  falha,
  aoDescartar,
  aoSalvar,
  area,
}: PropsDoEditorDoTipo) {
  const id = useId();
  const mudar = (mudanca: Partial<EdicaoDoTipo>) => aoMudar({ ...edicao, ...mudanca });
  const nome = edicao.nome.trim();

  return (
    <section className={estilos.editor} aria-labelledby={`${id}-nome`}>
      <header className={estilos.cabecalhoDoTipo}>
        <IconeDoTipo icone={edicao.icone} nome={nome} decorativo tamanho="cabecalho" />
        <div className={estilos.nomeDoTipo}>
          <h2 id={`${id}-nome`}>{nome === '' ? 'Sem nome' : nome}</h2>
          {edicao.frase.trim() !== '' && <p>{edicao.frase.trim()}</p>}
        </div>
        <div className={estilos.situacaoDoTipo}>
          <Selo selo={tipo.situacao} />
          <small>{contagemDoTipo(tipo)}</small>
        </div>
      </header>

      <div ref={area} className={estilos.secoes}>
        <section aria-labelledby={`${id}-identificacao`} className={estilos.secao}>
          <Carimbo nivel={3} id={`${id}-identificacao`}>
            Identificação
          </Carimbo>
          <div className={estilos.nomeEIcone}>
            <Recusavel erro={erros.nome}>
              <CampoDeTexto
                rotulo="Nome do tipo"
                value={edicao.nome}
                onChange={(valor) => mudar({ nome: valor })}
                erro={erros.nome}
              />
            </Recusavel>
            <Recusavel erro={erros.icone}>
              <EscolhaDeIconeCompacta
                rotulo="Ícone"
                opcoes={OPCOES_DE_ICONE}
                valor={edicao.icone}
                aoMudar={(valor) => mudar({ icone: valor as IconeDoTipoDeChamado })}
                erro={erros.icone}
              />
            </Recusavel>
          </div>
          <Recusavel erro={erros.frase}>
            <CampoDeTexto
              rotulo="Frase para o colaborador"
              value={edicao.frase}
              onChange={(valor) => mudar({ frase: valor })}
              erro={erros.frase}
            />
          </Recusavel>
        </section>

        <section aria-labelledby={`${id}-prazo`} className={estilos.secao}>
          <Carimbo nivel={3} id={`${id}-prazo`}>
            Prazo e atendimento
          </Carimbo>
          <FraseDoPrazo edicao={edicao} aoMudar={aoMudar} erros={erros} />
          <QuemAtende tipo={tipo} edicao={edicao} aoMudar={aoMudar} erros={erros} contas={contas} />
          <p className={estilos.ajuda}>
            O relógio para quando o chamado fica aguardando o colaborador.
          </p>
        </section>

        <section aria-labelledby={`${id}-depois`} className={estilos.secao}>
          <Carimbo nivel={3} id={`${id}-depois`}>
            O que acontece depois
          </Carimbo>
          <Chave
            titulo="Pode virar OS"
            descricao="Mostra “Virar OS”, com o ativo já preenchido."
            ligada={edicao.podeVirarOs}
            aoMudar={(podeVirarOs) => mudar({ podeVirarOs })}
          />
          <Chave
            titulo="Gera uma Solicitação"
            descricao="Só nos tipos de pedido, como o Toner."
            ligada={edicao.geraSolicitacao !== 'nao'}
            aoMudar={(ligada) =>
              mudar({
                geraSolicitacao: ligada
                  ? tipo.geraSolicitacao !== 'nao'
                    ? tipo.geraSolicitacao
                    : 'toner'
                  : 'nao',
              })
            }
            erro={erros.geraSolicitacao}
          >
            {edicao.geraSolicitacao !== 'nao' && (
              <div className={estilos.solicitacao}>
                <GrupoDeRadios
                  rotulo="A solicitação"
                  value={edicao.geraSolicitacao}
                  onChange={(valor) =>
                    mudar({ geraSolicitacao: valor as EdicaoDoTipo['geraSolicitacao'] })
                  }
                  orientation="horizontal"
                >
                  <Radio value="toner">Toner</Radio>
                  <Radio value="equipamento">Equipamento</Radio>
                </GrupoDeRadios>
                {edicao.geraSolicitacao === 'equipamento' && (
                  <Recusavel erro={erros.tipoDeAtivoDoEquipamento}>
                    <Selecao
                      rotulo="Tipo de ativo do equipamento"
                      opcoes={opcoesDoTipoDeAtivo(tiposDeAtivo.lista, tipo)}
                      selectedKey={edicao.tipoDeAtivoDoEquipamento}
                      onSelectionChange={(chave) =>
                        mudar({ tipoDeAtivoDoEquipamento: chave === null ? null : String(chave) })
                      }
                      descricao={tiposDeAtivo.falha ?? undefined}
                      erro={erros.tipoDeAtivoDoEquipamento}
                    />
                  </Recusavel>
                )}
              </div>
            )}
          </Chave>
          <Chave
            titulo="Pede o ativo"
            descricao="Todo chamado do tipo nasce com o ativo do formulário."
            ligada={edicao.pedeOAtivo}
            aoMudar={(pedeOAtivo) => mudar({ pedeOAtivo })}
            erro={erros.pedeOAtivo}
          />
        </section>

        <section aria-labelledby={`${id}-quem-ve`} className={estilos.secao}>
          <Carimbo nivel={3} id={`${id}-quem-ve`}>
            Quem vê
          </Carimbo>
          <Chave
            titulo="Aparece para o colaborador"
            descricao="Na aba, no chat e no portal."
            ligada={edicao.apareceParaOColaborador}
            aoMudar={(apareceParaOColaborador) => mudar({ apareceParaOColaborador })}
          />
          <Chave
            titulo="Só a TI abre"
            descricao={
              edicao.soATiAbre
                ? 'Ligado: o tipo sai da escolha do colaborador.'
                : 'Desligado: o colaborador abre sozinho.'
            }
            ligada={edicao.soATiAbre}
            aoMudar={(soATiAbre) => mudar({ soATiAbre })}
          />
        </section>
      </div>

      <div className={estilos.peDoEditor}>
        <MensagemDoPasso texto={falha.texto ?? erros.geral ?? null} chave={falha.chave} />
        <div className={estilos.botoesDoEditor}>
          <span className={estilos.formulario}>
            <Icone icone={ListChecks} tamanho={14} />
            {textoDoFormulario(tipo.campos)}
          </span>
          <span className={estilos.acoes}>
            <Botao onPress={aoDescartar} isDisabled={!mudou || salvando}>
              Descartar
            </Botao>
            <Botao
              nivel="primario"
              onPress={aoSalvar}
              isDisabled={!mudou}
              carregando={salvando}
              rotuloCarregando="Salvando o tipo"
            >
              Salvar o tipo
            </Botao>
          </span>
        </div>
      </div>
    </section>
  );
}

/** O que a tela marca para o foco ir ao primeiro campo recusado depois da gravação. */
function Recusavel({ erro, children }: { erro: string | undefined; children: ReactNode }) {
  return <div data-recusado={erro ? '' : undefined}>{children}</div>;
}

/** A recusa de um pedaço sem campo do kit, como uma chave ou um número da frase. */
function Erro({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className={estilos.erro}>
      <Icone icone={CircleAlert} tamanho={14} />
      {children}
    </p>
  );
}

/** As opções do tipo de ativo: os ativos e o gravado, quando foi inativado depois. */
function opcoesDoTipoDeAtivo(
  lista: readonly OpcaoDeSelecao[],
  tipo: TipoDeChamado,
): OpcaoDeSelecao[] {
  const gravado = tipo.tipoDeAtivoDoEquipamento;
  if (!gravado || lista.some((opcao) => opcao.id === gravado.id)) return [...lista];
  return [...lista, { id: gravado.id, rotulo: gravado.nome }].sort((uma, outra) =>
    uma.rotulo.localeCompare(outra.rotulo, 'pt-BR'),
  );
}

/** "Responde em [30] [min] e resolve em [8] [h], [no horário da TI].", com as recusas embaixo. */
function FraseDoPrazo({
  edicao,
  aoMudar,
  erros,
}: Pick<PropsDoEditorDoTipo, 'edicao' | 'aoMudar' | 'erros'>) {
  const id = useId();
  const { prazo } = edicao;
  const mudar = (mudanca: Partial<EdicaoDoTipo['prazo']>) =>
    aoMudar({ ...edicao, prazo: { ...prazo, ...mudanca } });
  // A mesma recusa nos dois números aparece uma vez, ligada aos dois.
  const iguais = erros.resposta !== undefined && erros.resposta === erros.resolucao;
  const idDoErro = {
    resposta: erros.resposta ? `${id}-resposta` : undefined,
    resolucao: erros.resolucao ? (iguais ? `${id}-resposta` : `${id}-resolucao`) : undefined,
  };

  return (
    <div>
      <div className={estilos.fraseDoPrazo}>
        Responde em
        <NumeroDoPrazo
          rotulo="Tempo da resposta"
          numero={prazo.resposta}
          aoMudar={(valor) => mudar({ resposta: { ...prazo.resposta, valor } })}
          idDoErro={idDoErro.resposta}
        />
        <SelecaoNaFrase
          rotulo="Unidade da resposta"
          opcoes={unidades(prazo.resposta, prazo.modo)}
          selectedKey={prazo.resposta.unidade}
          onSelectionChange={(chave) =>
            mudar({ resposta: { ...prazo.resposta, unidade: chave as UnidadeDoPrazo } })
          }
        />
        e resolve em
        <NumeroDoPrazo
          rotulo="Tempo da resolução"
          numero={prazo.resolucao}
          aoMudar={(valor) => mudar({ resolucao: { ...prazo.resolucao, valor } })}
          idDoErro={idDoErro.resolucao}
        />
        <span className={estilos.fimDaFrase}>
          <SelecaoNaFrase
            rotulo="Unidade da resolução"
            opcoes={unidades(prazo.resolucao, prazo.modo)}
            selectedKey={prazo.resolucao.unidade}
            onSelectionChange={(chave) =>
              mudar({ resolucao: { ...prazo.resolucao, unidade: chave as UnidadeDoPrazo } })
            }
          />
          ,
        </span>
        <span className={estilos.fimDaFrase}>
          <SelecaoNaFrase
            rotulo="Como o prazo conta"
            opcoes={MODOS}
            selectedKey={prazo.modo}
            onSelectionChange={(chave) => mudar({ modo: chave as ModoDoPrazo })}
          />
          .
        </span>
      </div>
      {erros.resposta && <Erro id={idDoErro.resposta}>{erros.resposta}</Erro>}
      {erros.resolucao && !iguais && <Erro id={idDoErro.resolucao}>{erros.resolucao}</Erro>}
    </div>
  );
}

/**
 * Um número da frase: só algarismos, até três, como o 1 a 999 da spec. Cada número recusado é marcado
 * sozinho, para o foco ir ao da recusa, e não ao primeiro da frase.
 */
function NumeroDoPrazo({
  rotulo,
  numero,
  aoMudar,
  idDoErro,
}: {
  rotulo: string;
  numero: NumeroDoPrazoNaEdicao;
  aoMudar: (valor: string) => void;
  idDoErro: string | undefined;
}) {
  return (
    <NumeroNaFrase
      rotulo={rotulo}
      valor={numero.valor}
      aoMudar={aoMudar}
      algarismos={3}
      invalido={idDoErro !== undefined}
      aria-describedby={idDoErro}
      data-recusado={idDoErro !== undefined ? '' : undefined}
    />
  );
}

/** Quem atende por padrão e "Se não houver ninguém", lado a lado. */
function QuemAtende({
  tipo,
  edicao,
  aoMudar,
  erros,
  contas,
}: Pick<PropsDoEditorDoTipo, 'tipo' | 'edicao' | 'aoMudar' | 'erros' | 'contas'>) {
  const opcoes = opcoesDeQuemAtende(contas.lista, tipo.atendePorPadrao);
  const escolhida = opcoes.find((opcao) => opcao.id === edicao.atendePorPadrao);
  const primeiroNome = escolhida ? (escolhida.rotulo.split(' ')[0] ?? escolhida.rotulo) : null;
  const semNinguem: OpcaoDeSelecao[] = [
    { id: 'triagem', rotulo: 'Cai na triagem' },
    ...(primeiroNome ? [{ id: 'fica', rotulo: `Fica com ${primeiroNome} mesmo assim` }] : []),
  ];
  return (
    <div className={estilos.par}>
      <Recusavel erro={erros.atendePorPadrao}>
        <Selecao
          rotulo="Quem atende por padrão"
          opcoes={opcoes}
          selectedKey={edicao.atendePorPadrao ?? NINGUEM}
          onSelectionChange={(chave) =>
            aoMudar(
              trocarQuemAtende(edicao, chave === NINGUEM || chave === null ? null : String(chave)),
            )
          }
          descricao={contas.falha ?? undefined}
          erro={erros.atendePorPadrao}
        />
      </Recusavel>
      <Selecao
        rotulo="Se não houver ninguém"
        opcoes={semNinguem}
        selectedKey={edicao.semNinguem}
        onSelectionChange={(chave) =>
          aoMudar({ ...edicao, semNinguem: chave === 'fica' ? 'fica' : 'triagem' })
        }
      />
    </div>
  );
}

/** Uma chave do tipo, com o nome, a explicação e "Ligado" ou "Desligado" escrito. */
function Chave({
  titulo,
  descricao,
  ligada,
  aoMudar,
  erro,
  children,
}: {
  titulo: string;
  descricao: string;
  ligada: boolean;
  aoMudar: (ligada: boolean) => void;
  erro?: string;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <div className={estilos.chave} data-recusado={erro ? '' : undefined}>
      <div className={estilos.linhaDaChave}>
        <span className={estilos.textoDaChave}>
          <span id={`${id}-titulo`}>{titulo}</span>
          <small id={`${id}-descricao`}>{descricao}</small>
        </span>
        <Interruptor
          isSelected={ligada}
          onChange={aoMudar}
          aria-labelledby={`${id}-titulo`}
          aria-describedby={erro ? `${id}-descricao ${id}-erro` : `${id}-descricao`}
          className={estilos.interruptor}
        >
          {ligada ? 'Ligado' : 'Desligado'}
        </Interruptor>
      </div>
      {erro && <Erro id={`${id}-erro`}>{erro}</Erro>}
      {children}
    </div>
  );
}
