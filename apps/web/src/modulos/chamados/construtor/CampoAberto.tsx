// O campo aberto no lugar, no construtor do formulário (change chamados-da-ti, design, "O construtor,
// os campos (tarefa 5.22)" e "A condição (tarefa 5.23)"; m09 e m10): o rótulo, o nome no resumo, as
// opções com o × e "Acrescentar", os tipos de ativo, "Obrigatório" e "Só a TI vê", lado a lado, a
// condição como frase e "Remover o campo". Cada recusa fica junto do que recusa: a do salvar no
// campo dela, e a da mudança na hora junto de quem a pediu.
import type { CampoDoFormulario, ClausulaDaCondicao, JuncaoDaCondicao } from '@grafite/domain';
import {
  Botao,
  CampoDeTexto,
  Checkbox,
  GrupoDeCheckboxes,
  Icone,
  Interruptor,
  RotuloDeSituacao,
  SelecaoNaFrase,
  type Situacao,
} from '@grafite/ui';
import {
  CircleAlert,
  Eye,
  EyeOff,
  GitBranch,
  type LucideIcon,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import estilos from './Construtor.module.css';
import {
  acrescentarOpcao,
  avisoDasOpcoes,
  descricaoDoNomeNoResumo,
  type ErrosDoCampo,
  LUGAR,
  type RecusaNaHora,
  sortearId,
} from './campos.ts';
import {
  avisoDaCondicao,
  camposDaCondicao,
  chaveDoValor,
  type EfeitoDaResposta,
  efeitoDasRespostas,
  nomeNaFrase,
  novaClausula,
  palavraDaClausula,
  tirarClausula,
  trocarCampoDaClausula,
  trocarValorDaClausula,
  valoresDaClausula,
} from './condicao.ts';

export interface PropsDoCampoAberto {
  /** O id do bloco, que o botão do cartão controla. */
  id: string;
  campo: CampoDoFormulario;
  /** Os campos do formulário, para o id da opção nova não repetir nenhum. */
  campos: readonly CampoDoFormulario[];
  erros: ErrosDoCampo | undefined;
  naHora: RecusaNaHora | null;
  /** Os tipos de ativo que o campo Ativo oferece. */
  tiposDeAtivo: readonly { id: string; rotulo: string }[];
  /**
   * A mudança no campo. Com o lugar, ela se confere na hora, e a resposta diz se entrou; sem ele,
   * como no que se escreve, entra sempre.
   */
  aoMudar: (campo: CampoDoFormulario, lugar?: string) => boolean;
  aoTirarOpcao: (opcaoId: string) => boolean;
  aoRemover: () => void;
}

export function CampoAberto({
  id,
  campo,
  campos,
  erros,
  naHora,
  tiposDeAtivo,
  aoMudar,
  aoTirarOpcao,
  aoRemover,
}: PropsDoCampoAberto) {
  const area = useRef<HTMLDivElement>(null);
  // A opção que recebe o foco: a acrescentada, ou a vizinha da que saiu.
  const [aFocar, definirAFocar] = useState<string | null>(null);
  useEffect(() => {
    if (aFocar === null) return;
    area.current
      ?.querySelector<HTMLInputElement>(`[data-opcao="${CSS.escape(aFocar)}"] input`)
      ?.focus();
    definirAFocar(null);
  }, [aFocar]);

  const recusaEm = (lugar: string) => (naHora?.lugar === lugar ? naHora.mensagem : null);
  const comOpcoes = campo.tipo === 'escolha-unica' || campo.tipo === 'varias-opcoes';
  const limiteDasOpcoes = avisoDasOpcoes(campo);

  const acrescentar = () => {
    const novo = acrescentarOpcao(campo, campos, sortearId);
    const nova = novo?.opcoes.at(-1);
    if (!novo || !nova) return;
    aoMudar(novo);
    definirAFocar(nova.id);
  };
  const tirar = (opcaoId: string) => {
    const indice = campo.opcoes.findIndex((opcao) => opcao.id === opcaoId);
    const vizinha = campo.opcoes[indice + 1] ?? campo.opcoes[indice - 1];
    if (aoTirarOpcao(opcaoId) && vizinha) definirAFocar(vizinha.id);
  };

  return (
    <div ref={area} id={id} className={estilos.propriedades}>
      {erros && erros.outras.length > 0 && (
        <div data-recusado="" tabIndex={-1} className={estilos.recusasDoCampo}>
          {erros.outras.map((erro) => (
            <Erro key={erro}>{erro}</Erro>
          ))}
        </div>
      )}
      <Recusavel erro={erros?.rotulo}>
        <CampoDeTexto
          rotulo="Rótulo"
          value={campo.rotulo}
          onChange={(rotulo) => aoMudar({ ...campo, rotulo })}
          maxLength={80}
          erro={erros?.rotulo}
        />
      </Recusavel>
      <Recusavel erro={erros?.nomeNoResumo}>
        <CampoDeTexto
          rotulo="Nome no resumo"
          descricao={descricaoDoNomeNoResumo(campo)}
          value={campo.nomeNoResumo ?? ''}
          onChange={(nome) => aoMudar({ ...campo, nomeNoResumo: nome === '' ? null : nome })}
          maxLength={30}
          erro={erros?.nomeNoResumo}
        />
      </Recusavel>
      {comOpcoes && (
        <Opcoes
          campo={campo}
          erros={erros}
          recusaEm={recusaEm}
          limite={limiteDasOpcoes}
          aoMudar={aoMudar}
          aoAcrescentar={acrescentar}
          aoTirar={tirar}
        />
      )}
      {campo.tipo === 'ativo' && (
        <Recusavel erro={erros?.tiposDeAtivo}>
          <GrupoDeCheckboxes
            rotulo="Tipos de ativo"
            descricao="Nenhum marcado, o campo aceita ativos de qualquer tipo."
            erro={erros?.tiposDeAtivo}
            value={campo.tiposDeAtivo}
            // Na ordem da lista, para marcar e desmarcar não mudar o campo.
            onChange={(marcados) =>
              aoMudar({
                ...campo,
                tiposDeAtivo: tiposDeAtivo
                  .filter((tipo) => marcados.includes(tipo.id))
                  .map((tipo) => tipo.id),
              })
            }
          >
            {tiposDeAtivo.map((tipo) => (
              <Checkbox key={tipo.id} value={tipo.id}>
                {tipo.rotulo}
              </Checkbox>
            ))}
          </GrupoDeCheckboxes>
        </Recusavel>
      )}
      <div className={estilos.duas}>
        <ChaveDoCampo
          titulo="Obrigatório"
          ligada={campo.obrigatorio}
          recusa={recusaEm(LUGAR.obrigatorio(campo.id))}
          aoMudar={(obrigatorio) => aoMudar({ ...campo, obrigatorio }, LUGAR.obrigatorio(campo.id))}
        />
        <ChaveDoCampo
          titulo="Só a TI vê"
          ligada={campo.soDaTi}
          recusa={recusaEm(LUGAR.soDaTi(campo.id))}
          aoMudar={(soDaTi) => aoMudar({ ...campo, soDaTi }, LUGAR.soDaTi(campo.id))}
        />
      </div>
      {erros?.pedeOAtivo && (
        <div data-recusado="" tabIndex={-1}>
          <Erro>{erros.pedeOAtivo}</Erro>
        </div>
      )}
      <CondicaoDoCampo
        campo={campo}
        campos={campos}
        erro={erros?.condicao}
        recusa={recusaEm(LUGAR.condicao(campo.id))}
        aoMudar={aoMudar}
      />
      <div className={estilos.removerOCampo}>
        <Botao nivel="terciario" icone={Trash2} onPress={aoRemover}>
          Remover o campo
        </Botao>
        <RecusaNaHoraDoControle mensagem={recusaEm(LUGAR.remover(campo.id))} />
      </div>
    </div>
  );
}

/** As opções da Escolha única e das Várias opções, cada uma num campo de texto com o ×. */
function Opcoes({
  campo,
  erros,
  recusaEm,
  limite,
  aoMudar,
  aoAcrescentar,
  aoTirar,
}: {
  campo: CampoDoFormulario;
  erros: ErrosDoCampo | undefined;
  recusaEm: (lugar: string) => string | null;
  limite: string | null;
  aoMudar: (campo: CampoDoFormulario) => boolean;
  aoAcrescentar: () => void;
  aoTirar: (opcaoId: string) => void;
}) {
  const id = useId();
  const recusadas = campo.opcoes.flatMap((opcao, indice) => {
    const erro = erros && Object.hasOwn(erros.porOpcao, opcao.id) ? erros.porOpcao[opcao.id] : null;
    const naHora = recusaEm(LUGAR.opcao(campo.id, opcao.id));
    return erro || naHora ? [{ opcao, indice, erro, naHora }] : [];
  });
  return (
    <fieldset className={estilos.grupoDasOpcoes} data-recusado={erros?.opcoes ? '' : undefined}>
      <legend className={estilos.rotuloDaParte}>Opções</legend>
      <div className={estilos.opcoes}>
        {campo.opcoes.map((opcao, indice) => {
          const recusada = recusadas.find((cada) => cada.opcao.id === opcao.id);
          return (
            <span
              key={opcao.id}
              className={estilos.opcao}
              data-opcao={opcao.id}
              data-recusado={recusada?.erro ? '' : undefined}
            >
              <span className={estilos.medida} data-valor={opcao.texto}>
                <input
                  type="text"
                  // O tamanho vem da cópia escondida do texto; sem isso, o campo pede 20 letras.
                  size={1}
                  aria-label={`Opção ${indice + 1}`}
                  aria-invalid={recusada?.erro ? true : undefined}
                  aria-describedby={recusada ? `${id}-recusa-${opcao.id}` : undefined}
                  value={opcao.texto}
                  maxLength={60}
                  onChange={(evento) =>
                    aoMudar({
                      ...campo,
                      opcoes: campo.opcoes.map((cada) =>
                        cada.id === opcao.id ? { ...cada, texto: evento.target.value } : cada,
                      ),
                    })
                  }
                />
              </span>
              <button
                type="button"
                className={estilos.tirarOpcao}
                aria-label={`Tirar a opção “${opcao.texto || `Opção ${indice + 1}`}”`}
                onClick={() => aoTirar(opcao.id)}
              >
                <Icone icone={X} tamanho={12} />
              </button>
            </span>
          );
        })}
        <button
          type="button"
          className={estilos.acrescentarOpcao}
          disabled={limite !== null}
          onClick={aoAcrescentar}
        >
          <Icone icone={Plus} tamanho={12} />
          Acrescentar
        </button>
      </div>
      {erros?.opcoes && <Erro>{erros.opcoes}</Erro>}
      {recusadas.map(({ opcao, indice, erro, naHora }) => (
        <Erro key={opcao.id} id={`${id}-recusa-${opcao.id}`} alerta={naHora !== null}>
          {`Opção ${indice + 1}: ${naHora ?? erro}`}
        </Erro>
      ))}
      {limite && <p className={estilos.notaDasOpcoes}>{limite}</p>}
    </fieldset>
  );
}

/** O selo de cada resposta em "O que cada resposta faz". */
const SELOS_DO_EFEITO: Record<
  EfeitoDaResposta,
  { situacao: Situacao; icone: LucideIcon; texto: string }
> = {
  aparece: { situacao: 'sucesso', icone: Eye, texto: 'O campo aparece' },
  some: { situacao: 'neutra', icone: EyeOff, texto: 'O campo some' },
  depende: { situacao: 'neutra', icone: GitBranch, texto: 'Depende das outras respostas' },
};

const PALAVRAS_DA_JUNCAO: Record<JuncaoDaCondicao, string> = { e: 'e quando', ou: 'ou quando' };

/**
 * "Quando mostrar este campo": a condição como frase, do m10, com uma linha por parte, "+ e
 * quando…" e "+ ou quando…", o que cada resposta faz e o "Apagar a resposta se o campo sumir". As
 * mudanças da condição se conferem na hora, com a recusa embaixo da frase.
 */
function CondicaoDoCampo({
  campo,
  campos,
  erro,
  recusa,
  aoMudar,
}: {
  campo: CampoDoFormulario;
  campos: readonly CampoDoFormulario[];
  /** A recusa do salvar. */
  erro: string | undefined;
  /** A recusa da mudança na hora. */
  recusa: string | null;
  aoMudar: (campo: CampoDoFormulario, lugar?: string) => boolean;
}) {
  const area = useRef<HTMLFieldSetElement>(null);
  // O que recebe o foco: o campo da parte acrescentada, ou o botão de acrescentar, depois de tirar.
  const [aFocar, definirAFocar] = useState<number | 'acrescentar' | null>(null);
  useEffect(() => {
    if (aFocar === null) return;
    const seletor =
      aFocar === 'acrescentar' ? '[data-acrescentar] button' : `[data-parte="${aFocar}"] button`;
    area.current?.querySelector<HTMLElement>(seletor)?.focus();
    definirAFocar(null);
  }, [aFocar]);

  const { condicao } = campo;
  const servem = camposDaCondicao(campo, campos);
  const aviso = avisoDaCondicao(campo, campos);
  const mudarCondicao = (nova: ClausulaDaCondicao[]) =>
    aoMudar({ ...campo, condicao: nova }, LUGAR.condicao(campo.id));
  const acrescentar = (juncao: JuncaoDaCondicao | null) => {
    const nova = novaClausula(campo, campos, juncao);
    if (nova && mudarCondicao([...condicao, nova])) definirAFocar(condicao.length);
  };
  const tirar = (indice: number) => {
    if (mudarCondicao(tirarClausula(condicao, indice))) definirAFocar('acrescentar');
  };
  const trocar = (indice: number, clausula: ClausulaDaCondicao) =>
    mudarCondicao(condicao.map((cada, posicao) => (posicao === indice ? clausula : cada)));

  return (
    <fieldset
      ref={area}
      className={estilos.grupoDasOpcoes}
      data-recusado={erro ? '' : undefined}
      data-condicao=""
    >
      <legend className={estilos.rotuloDaParte}>Quando mostrar este campo</legend>
      <div className={estilos.frase}>
        <p className={estilos.mostrar}>
          Mostrar <b>“{nomeNaFrase(campo)}”</b>
          {condicao.length === 0 && ' sempre.'}
        </p>
        {condicao.map((clausula, indice) => {
          const base = campos.find((cada) => cada.id === clausula.campoId);
          if (!base) return null;
          const parte = indice + 1;
          // O campo de agora fica na lista, para a seleção mostrá-lo mesmo fora do que serve.
          const opcoesDoCampo = (servem.includes(base) ? servem : [...servem, base]).map(
            (cada) => ({ id: cada.id, rotulo: nomeNaFrase(cada) }),
          );
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: a parte não tem id, e a posição a nomeia, como no "Tirar a parte 2".
              key={indice}
              className={estilos.parte}
              data-parte={indice}
            >
              {/* Na linha que não cabe, a frase quebra antes do "for", e o × fica na primeira. */}
              <span className={estilos.fraseDaParte}>
                <span className={estilos.pedaco}>
                  {clausula.juncao ? PALAVRAS_DA_JUNCAO[clausula.juncao] : 'quando'}
                  <SelecaoNaFrase
                    rotulo={`Campo da parte ${parte} da condição`}
                    className={estilos.selecaoDaParte}
                    opcoes={opcoesDoCampo}
                    selectedKey={clausula.campoId}
                    onSelectionChange={(chave) => {
                      const novo = servem.find((cada) => cada.id === chave);
                      if (novo && novo !== base) {
                        trocar(indice, trocarCampoDaClausula(clausula, novo));
                      }
                    }}
                  />
                </span>
                <span className={estilos.pedaco}>
                  {palavraDaClausula(base)}
                  <SelecaoNaFrase
                    rotulo={`Resposta da parte ${parte} da condição`}
                    className={estilos.selecaoDaParte}
                    opcoes={valoresDaClausula(base)}
                    selectedKey={chaveDoValor(clausula)}
                    onSelectionChange={(chave) => {
                      if (chave !== null && chave !== chaveDoValor(clausula)) {
                        trocar(indice, trocarValorDaClausula(clausula, String(chave)));
                      }
                    }}
                  />
                </span>
              </span>
              <button
                type="button"
                className={estilos.tirarParte}
                aria-label={`Tirar a parte ${parte} da condição`}
                onClick={() => tirar(indice)}
              >
                <Icone icone={X} tamanho={14} />
              </button>
            </div>
          );
        })}
      </div>
      {erro && <Erro>{erro}</Erro>}
      <RecusaNaHoraDoControle mensagem={recusa} />
      <div className={estilos.maisPartes} data-acrescentar="">
        {condicao.length === 0 ? (
          <Botao icone={Plus} isDisabled={aviso !== null} onPress={() => acrescentar(null)}>
            Só quando…
          </Botao>
        ) : (
          <>
            <Botao icone={Plus} isDisabled={aviso !== null} onPress={() => acrescentar('e')}>
              e quando…
            </Botao>
            <Botao icone={Plus} isDisabled={aviso !== null} onPress={() => acrescentar('ou')}>
              ou quando…
            </Botao>
          </>
        )}
      </div>
      {aviso && <p className={estilos.notaDasOpcoes}>{aviso}</p>}
      {condicao.length > 0 && (
        <>
          <EfeitosDasRespostas campo={campo} campos={campos} />
          <ChaveDoCampo
            titulo="Apagar a resposta se o campo sumir"
            ligada={campo.apagarSeSumir}
            aoMudar={(apagarSeSumir) => aoMudar({ ...campo, apagarSeSumir })}
          />
        </>
      )}
    </fieldset>
  );
}

/** "O que cada resposta faz": uma lista por campo da condição, com o selo de cada resposta. */
function EfeitosDasRespostas({
  campo,
  campos,
}: {
  campo: CampoDoFormulario;
  campos: readonly CampoDoFormulario[];
}) {
  const grupos = efeitoDasRespostas(campo, campos);
  return (
    <div className={estilos.efeitos}>
      <p className={estilos.rotuloDaParte}>O que cada resposta faz</p>
      {grupos.map(({ campo: base, linhas }) => (
        <div key={base.id} className={estilos.grupoDoEfeito}>
          {grupos.length > 1 && <p className={estilos.campoDoEfeito}>“{nomeNaFrase(base)}”</p>}
          <ul
            className={estilos.listaDosEfeitos}
            aria-label={`O que cada resposta de “${nomeNaFrase(base)}” faz`}
          >
            {linhas.map((linha) => {
              const selo = SELOS_DO_EFEITO[linha.efeito];
              return (
                <li key={linha.chave} data-aparece={linha.efeito === 'aparece' ? '' : undefined}>
                  <span>{linha.rotulo}</span>
                  <RotuloDeSituacao situacao={selo.situacao} icone={selo.icone}>
                    {selo.texto}
                  </RotuloDeSituacao>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** "Obrigatório", "Só a TI vê" e "Começar pelo nome do tipo", com o "Sim" e o "Não" do m09. */
export function ChaveDoCampo({
  titulo,
  ligada,
  recusa,
  aoMudar,
}: {
  titulo: string;
  ligada: boolean;
  recusa?: string | null;
  aoMudar: (ligada: boolean) => void;
}) {
  const id = useId();
  return (
    <div className={estilos.chave}>
      <div className={estilos.linhaDaChave}>
        <span id={`${id}-titulo`}>{titulo}</span>
        <Interruptor
          isSelected={ligada}
          onChange={aoMudar}
          aria-labelledby={`${id}-titulo`}
          aria-describedby={recusa ? `${id}-recusa` : undefined}
        >
          {ligada ? 'Sim' : 'Não'}
        </Interruptor>
      </div>
      <RecusaNaHoraDoControle id={`${id}-recusa`} mensagem={recusa ?? null} />
    </div>
  );
}

/** A recusa da mudança na hora, que o leitor de tela lê assim que aparece. */
function RecusaNaHoraDoControle({ id, mensagem }: { id?: string; mensagem: string | null }) {
  if (!mensagem) return null;
  return (
    <Erro id={id} alerta>
      {mensagem}
    </Erro>
  );
}

/** O pedaço recusado no salvar, para o foco achar o primeiro. */
function Recusavel({ erro, children }: { erro: string | undefined; children: ReactNode }) {
  return <div data-recusado={erro ? '' : undefined}>{children}</div>;
}

/** A recusa, com o ícone, na cor crítica. */
export function Erro({
  id,
  alerta = false,
  children,
}: {
  id?: string;
  alerta?: boolean;
  children: ReactNode;
}) {
  return (
    <p id={id} role={alerta ? 'alert' : undefined} className={estilos.erro}>
      <Icone icone={CircleAlert} tamanho={14} />
      {children}
    </p>
  );
}
