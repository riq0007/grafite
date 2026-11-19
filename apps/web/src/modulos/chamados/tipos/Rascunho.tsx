// As peças da gaveta do Rascunho (change chamados-da-ti, design, "O rascunho, o duplicar e a
// situação (tarefa 5.20)"; m08): o aviso do duplicado, a seção do formulário, o pé com "Descartar
// rascunho", "Salvar rascunho" e "Criar o tipo", e a prévia com o Rascunho marcado "novo" e o que a
// pessoa responde depois de escolhê-lo. Quem grava é a tela.
import { AVISO_DA_SOLICITACAO_NO_DUPLICAR } from '@grafite/domain';
import { Botao, Carimbo, Icone, MensagemDoPasso } from '@grafite/ui';
import { useNavigate } from '@tanstack/react-router';
import { Check, Copy, EyeOff, Pencil } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { Confirmacao } from '../../administracao/Confirmacao.tsx';
import { GradeDosTipos } from '../previa/GradeDosTipos.tsx';
import { TelaDaAba } from '../previa/TelaDaAba.tsx';
import type { FalhaDoEditor } from './EditorDoTipo.tsx';
import {
  type CampoNaGaveta,
  camposQueAPessoaVe,
  fraseDaGradeDoRascunho,
  listaDosCampos,
  notasDaPrevia,
  type TipoDeChamado,
  type TipoEditado,
  textoDoFormularioDoRascunho,
  tiposNaPrevia,
} from './edicao.ts';
import estilos from './Tipos.module.css';

/** "Duplicado de Computador.", com o aviso da solicitação logo depois de duplicar. */
export function AvisoDoDuplicado({
  origem,
  solicitacaoDesligada,
}: {
  origem: string;
  solicitacaoDesligada: boolean;
}) {
  return (
    <div className={estilos.avisoDoDuplicado}>
      <Icone icone={Copy} tamanho={18} />
      <div>
        <p>
          <strong>Duplicado de {origem}.</strong> O prazo, o responsável e o formulário vieram de
          lá. Mude só o que for diferente.
        </p>
        {solicitacaoDesligada && <p>{AVISO_DA_SOLICITACAO_NO_DUPLICAR}</p>}
      </div>
    </div>
  );
}

/** Os campos lidos do formulário do Rascunho: carregando, a falha da leitura ou os campos. */
export type FormularioLido =
  | { estado: 'carregando' }
  | { estado: 'falha'; texto: string }
  | { estado: 'lido'; campos: readonly CampoNaGaveta[] };

/**
 * "Formulário": quantos campos, de onde vieram e cada um com o tipo, e "Editar os campos", que abre
 * o construtor (tarefa 5.21).
 */
export function SecaoDoFormulario({
  formulario,
  origem,
  tipo,
}: {
  formulario: FormularioLido;
  origem: string | null;
  /** O id do Rascunho, cujo formulário o construtor abre. */
  tipo: string;
}) {
  const id = useId();
  const navegar = useNavigate();
  return (
    <section aria-labelledby={`${id}-formulario`} className={estilos.secao}>
      <Carimbo nivel={3} id={`${id}-formulario`}>
        Formulário
      </Carimbo>
      {formulario.estado === 'lido' ? (
        <div className={estilos.formularioDoRascunho}>
          <p className={estilos.copiaDoFormulario}>
            <span>{textoDoFormularioDoRascunho(formulario.campos.length, origem)}</span>
            {formulario.campos.length > 0 && <small>{listaDosCampos(formulario.campos)}</small>}
          </p>
          <Botao
            icone={Pencil}
            onPress={() =>
              void navegar({ to: '/chamados/tipos/$id/formulario', params: { id: tipo } })
            }
          >
            Editar os campos
          </Botao>
        </div>
      ) : (
        <p className={estilos.ajuda}>
          {formulario.estado === 'falha' ? formulario.texto : 'Carregando o formulário…'}
        </p>
      )}
    </section>
  );
}

/** O pé do Rascunho: "Descartar rascunho", confirmado, "Salvar rascunho" e "Criar o tipo". */
export function PeDoRascunho({
  nome,
  erros,
  falha,
  mudou,
  salvando,
  criando,
  aoSalvar,
  aoCriar,
  aoDescartar,
}: {
  nome: string;
  erros: Readonly<Record<string, string>>;
  falha: FalhaDoEditor;
  mudou: boolean;
  salvando: boolean;
  criando: boolean;
  aoSalvar: () => void;
  aoCriar: () => void;
  aoDescartar: () => Promise<{ ok: true } | { erro: string }>;
}) {
  const ocupado = salvando || criando;
  const botaoDeSalvar = useRef<HTMLButtonElement>(null);
  const botaoDeCriar = useRef<HTMLButtonElement>(null);
  const salvandoAntes = useRef(salvando);
  useEffect(() => {
    // Salvo, o "Salvar rascunho" desliga, e o foco dele cairia fora da gaveta, onde o Esc não a
    // fecha: ele vai ao "Criar o tipo", o passo seguinte.
    const ativo = document.activeElement;
    const perdido = !ativo || ativo === document.body || ativo === botaoDeSalvar.current;
    if (salvandoAntes.current && !salvando && !mudou && perdido) botaoDeCriar.current?.focus();
    salvandoAntes.current = salvando;
  }, [salvando, mudou]);
  return (
    <div className={estilos.peDoEditor}>
      <MensagemDoPasso texto={falha.texto ?? erros.geral ?? null} chave={falha.chave} />
      <div className={`${estilos.botoesDoEditor} ${estilos.botoesDoRascunho}`}>
        <span className={estilos.formulario}>Só aparece para o colaborador depois de criado.</span>
        <span className={estilos.acoes}>
          {/* Com o "Salvar rascunho" ou o "Criar o tipo" em curso, o descarte espera a resposta. */}
          {ocupado ? (
            <Botao isDisabled>Descartar rascunho</Botao>
          ) : (
            <Confirmacao
              acao="Descartar rascunho"
              titulo={`Descartar o rascunho ${nome}?`}
              confirmando="Descartando o rascunho"
              nivelDoGatilho="secundario"
              fazer={aoDescartar}
            >
              <p className={estilos.informacao}>O rascunho sai da lista, com o formulário dele.</p>
            </Confirmacao>
          )}
          <Botao
            ref={botaoDeSalvar}
            onPress={aoSalvar}
            isDisabled={!mudou || criando}
            carregando={salvando}
            rotuloCarregando="Salvando o rascunho"
          >
            Salvar rascunho
          </Botao>
          <Botao
            ref={botaoDeCriar}
            nivel="primario"
            icone={Check}
            onPress={aoCriar}
            isDisabled={ocupado && !criando}
            carregando={criando}
            rotuloCarregando="Criando o tipo"
          >
            Criar o tipo
          </Botao>
        </span>
      </div>
    </div>
  );
}

/**
 * A prévia da gaveta: a grade da aba sem a faixa de quem pede, com o Rascunho marcado "novo" no
 * lugar dele, a nota quando ele só é da TI e o que a pessoa responde depois de escolhê-lo.
 */
export function PreviaDoRascunho({
  tipos,
  editado,
  formulario,
}: {
  tipos: readonly TipoDeChamado[];
  editado: TipoEditado;
  formulario: FormularioLido;
}) {
  const id = useId();
  const naGrade = tiposNaPrevia(tipos, editado);
  const lugar = naGrade.findIndex((tipo) => tipo.id === editado.id);
  const notas = notasDaPrevia(tipos, editado);
  const nome = editado.edicao.nome.trim() || 'Sem nome';
  const campos = formulario.estado === 'lido' ? camposQueAPessoaVe(formulario.campos) : null;
  return (
    <aside className={estilos.previa} aria-labelledby={`${id}-previa`}>
      <h2 id={`${id}-previa`}>Como o colaborador vê</h2>
      <p>{fraseDaGradeDoRascunho(lugar < 0 ? null : lugar + 1)}</p>
      <TelaDaAba rotulo="A aba do colaborador" trilha={['Aba', 'Abrir chamado']} passo="1 de 3">
        <GradeDosTipos tipos={naGrade} />
      </TelaDaAba>
      {notas.soDaTi && (
        <p className={estilos.nota}>
          <Icone icone={EyeOff} tamanho={14} />
          <span>{notas.soDaTi}</span>
        </p>
      )}
      {campos &&
        (campos.length === 0 ? (
          <p className={estilos.depoisDeEscolher}>Depois de escolher {nome}: nenhum campo.</p>
        ) : (
          <div className={estilos.depoisDeEscolher}>
            <span id={`${id}-depois`}>Depois de escolher {nome}:</span>
            <ol aria-labelledby={`${id}-depois`}>
              {campos.map((campo, indice) => (
                <li key={campo.id}>
                  <span className={estilos.numeroDoCampo} aria-hidden="true">
                    {indice + 1}
                  </span>
                  {campo.rotulo}
                  <small>{campo.tipo}</small>
                </li>
              ))}
            </ol>
          </div>
        ))}
    </aside>
  );
}
