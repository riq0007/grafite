// O campo aberto no lugar, no construtor do formulário (change chamados-da-ti, design, "O construtor,
// os campos (tarefa 5.22)"; m09): o rótulo, o nome no resumo, as opções com o × e "Acrescentar", os
// tipos de ativo, "Obrigatório" e "Só a TI vê", lado a lado, e "Remover o campo". Cada recusa fica
// junto do que recusa: a do salvar no campo dela, e a da mudança na hora junto de quem a pediu.
import type { CampoDoFormulario } from '@grafite/domain';
import { Botao, CampoDeTexto, Checkbox, GrupoDeCheckboxes, Icone, Interruptor } from '@grafite/ui';
import { CircleAlert, Plus, Trash2, X } from 'lucide-react';
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
