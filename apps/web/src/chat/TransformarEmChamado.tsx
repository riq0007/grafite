// "Transformar em chamado" (spec modulo-chat, "Transformar em chamado na tela"; spec chamados, "Abrir
// um chamado pelo chat"; mockups m02 e m03): o diálogo que o menu da mensagem e o Ctrl+Shift+T abrem,
// com a mensagem citada como ela é, com quem escreveu e a hora; os tipos em chips com o ícone; o
// título, com o contador; no tipo que pede o ativo, o ativo sugerido, o primeiro escolhido, e
// "Trocar", que lista os sugeridos; e "No nome de", a pessoa da conta, com "Trocar", que busca a
// pessoa pelo nome. Aberto o chamado, o diálogo fecha, e a lista e a conversa se releem: o chamado
// entra no alto de CHAMADOS, e o evento, no fim da conversa. A recusa fica no campo dela.
import { LIMITE_DO_TITULO_DO_CHAMADO, semAtivoSugerido, tamanhoDoTitulo } from '@grafite/domain';
import {
  Avatar,
  avisar,
  Botao,
  BuscaComSugestoes,
  CampoDeTexto,
  Dialogo,
  GrupoDeRadios,
  Icone,
  ItemDeMenu,
  Menu,
  Popover,
  Radio,
  SecaoDeMenu,
  useDataHora,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { LifeBuoy } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { pedir } from '../api/pedir.ts';
import { useApi } from '../api/useApi.tsx';
import { Recusa } from '../modulos/chamados/formulario/Recusa.tsx';
import { ICONES_DOS_TIPOS_DE_CHAMADO } from '../modulos/chamados/icones.ts';
import { useSessao } from '../sessao/useSessao.tsx';
import { useChamadoNovo } from './chamadoNovo.tsx';
import {
  type AtivoSugeridoPeloChat,
  CHAVE_DO_RESUMO_DO_CHAT,
  CHAVE_DOS_CHAMADOS_DO_CHAT,
  chaveDaConversa,
  type TipoParaAbrirPeloChat,
  useAtivosSugeridosPeloChat,
  usePessoasParaOChamado,
  useTiposDaAberturaPeloChat,
} from './consultas.ts';
import type { MensagemDoChat } from './conversa.ts';
import { FalhaDoChat } from './FalhaDoChat.tsx';
import estilos from './TransformarEmChamado.module.css';

/** A mensagem que vira chamado, com o nome de quem a escreveu como a conversa o mostra. */
export interface MensagemATransformar {
  mensagem: MensagemDoChat;
  autor: string;
}

/** A pessoa de "No nome de": a da conta que abre, ou a escolhida pelo nome. */
interface PessoaDoChamado {
  id: string;
  nome: string;
}

/** As recusas da abertura, cada uma no campo dela, como a API as devolve. */
type Recusas = Partial<Record<'tipo' | 'titulo' | 'ativo' | 'pessoa', string>>;

/**
 * O primeiro campo recusado, na ordem do diálogo: um tipo da grade, o título ou o "Trocar" do ativo
 * e da pessoa.
 */
const RECUSADO =
  '[role="radiogroup"][aria-invalid="true"] input, input[aria-invalid="true"], [data-recusado]';

export function TransformarEmChamado({
  alvo,
  conversa,
  aoFechar,
}: {
  alvo: MensagemATransformar | null;
  conversa: string;
  aoFechar: () => void;
}) {
  // A citada continua no diálogo enquanto ele sai da tela.
  const [mostrada, definirMostrada] = useState(alvo);
  if (alvo !== null && alvo !== mostrada) definirMostrada(alvo);
  const citada = alvo ?? mostrada;
  return (
    <Dialogo
      titulo="Transformar em chamado"
      aberto={alvo !== null}
      aoMudarAberto={(aberto) => {
        if (!aberto) aoFechar();
      }}
      largo
    >
      {(fechar) =>
        citada && (
          <FormularioDoChamado
            key={citada.mensagem.id}
            citada={citada}
            conversa={conversa}
            fechar={fechar}
          />
        )
      }
    </Dialogo>
  );
}

function FormularioDoChamado({
  citada,
  conversa,
  fechar,
}: {
  citada: MensagemATransformar;
  conversa: string;
  fechar: () => void;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const roteador = useRouter();
  const sessao = useSessao();
  const chamadoNovo = useChamadoNovo();
  const tipos = useTiposDaAberturaPeloChat(true);
  const [tipoEscolhido, definirTipoEscolhido] = useState<string | null>(null);
  const [titulo, definirTitulo] = useState('');
  // "No nome de" começa na pessoa da conta que abre.
  const [pessoa, definirPessoa] = useState<PessoaDoChamado | null>(() =>
    sessao.tipo === 'ativa' && sessao.conta.pessoaId
      ? { id: sessao.conta.pessoaId, nome: sessao.conta.nome }
      : null,
  );
  // O ativo trocado; sem ele, o primeiro sugerido.
  const [ativoEscolhido, definirAtivoEscolhido] = useState<string | null>(null);
  const [recusas, definirRecusas] = useState<Recusas>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [enviando, definirEnviando] = useState(false);
  const [pedidoDeFoco, definirPedidoDeFoco] = useState(0);
  const formulario = useRef<HTMLFormElement>(null);

  // O tipo escolhido que saiu da lista, como o que deixou de abrir pelo chat, deixa a escolha vazia.
  const tipo = tipos.data?.itens.find(({ id }) => id === tipoEscolhido) ?? null;
  const sugeridos = useAtivosSugeridosPeloChat(
    tipo?.pedeOAtivo ? tipo.id : null,
    pessoa?.id ?? null,
  );
  const ativos = sugeridos.data?.ativos ?? [];
  const ativo = ativos.find(({ id }) => id === ativoEscolhido) ?? ativos[0] ?? null;
  // Os campos com o controle na tela, onde a recusa deles aparece: os tipos, quando a lista está na
  // tela, e o ativo, quando os sugeridos chegaram. "Abrir chamado" fica sem ação enquanto os tipos ou
  // os sugeridos não chegam e sem nenhum tipo, porque o pedido iria sem o que a tela ainda vai mostrar.
  const comOsTipos = tipos.isSuccess && tipos.data.itens.length > 0;
  const comOAtivo = Boolean(tipo?.pedeOAtivo) && pessoa !== null;
  const comOsSugeridos = comOAtivo && sugeridos.isSuccess;
  const semAcao = !comOsTipos || (comOAtivo && !sugeridos.isSuccess);

  // O foco vai ao primeiro campo recusado, depois de a tela mostrar as recusas. Sem nenhum sugerido,
  // o ativo não tem o que escolher, e a recusa manda trocar o tipo: o foco vai ao tipo escolhido.
  useEffect(() => {
    if (pedidoDeFoco === 0) return;
    const raiz = formulario.current;
    (
      raiz?.querySelector<HTMLElement>(RECUSADO) ??
      raiz?.querySelector<HTMLElement>('input[type="radio"]:checked')
    )?.focus();
  }, [pedidoDeFoco]);

  const tirarRecusas = (...campos: (keyof Recusas)[]) =>
    definirRecusas((antes) => {
      const depois = { ...antes };
      for (const campo of campos) delete depois[campo];
      return depois;
    });
  // Os sugeridos seguem o tipo e a pessoa: a troca de um deles volta ao primeiro sugerido.
  const escolherTipo = (id: string) => {
    definirTipoEscolhido(id);
    definirAtivoEscolhido(null);
    tirarRecusas('tipo', 'ativo');
  };
  const escolherPessoa = (escolhida: PessoaDoChamado) => {
    definirPessoa(escolhida);
    definirAtivoEscolhido(null);
    tirarRecusas('pessoa', 'ativo');
  };

  async function abrir(evento: FormEvent) {
    evento.preventDefault();
    if (enviando || semAcao) return;
    definirEnviando(true);
    definirFalha(null);
    try {
      const resultado = await pedir(
        () =>
          api.POST('/chat/mensagens/{id}/chamado', {
            params: { path: { id: citada.mensagem.id } },
            body: {
              tipo: tipo?.id ?? null,
              titulo,
              pessoa: pessoa?.id ?? null,
              ativo: tipo?.pedeOAtivo ? (ativo?.id ?? null) : null,
            },
          }),
        'abrir o chamado',
      );
      if (!('dados' in resultado)) {
        const campos = Object.entries(resultado.problema?.campos ?? {}).filter(
          (campo): campo is [string, string] => typeof campo[1] === 'string',
        );
        if (campos.length > 0) {
          // A recusa do campo que não está na tela, como a do ativo no tipo que não o pede, fica
          // acima das ações, para não sumir.
          const naTela = new Set<string>(['titulo', 'pessoa']);
          if (comOsTipos) naTela.add('tipo');
          if (comOsSugeridos) naTela.add('ativo');
          const nosCampos = campos.filter(([campo]) => naTela.has(campo));
          const foraDeles = campos.filter(([campo]) => !naTela.has(campo));
          definirRecusas(Object.fromEntries(nosCampos) as Recusas);
          definirFalha(foraDeles.length > 0 ? foraDeles.map(([, texto]) => texto).join(' ') : null);
          if (nosCampos.length > 0) definirPedidoDeFoco((antes) => antes + 1);
          return;
        }
        // A mensagem que já virou chamado mostra a marca na conversa, que se relê.
        if (resultado.problema?.status === 409) {
          void consultas.invalidateQueries({ queryKey: chaveDaConversa(conversa) });
        }
        definirRecusas({});
        definirFalha(resultado.erro);
        return;
      }
      // O chamado entra no alto de CHAMADOS, com o contorno forte, até a lista ser montada de novo.
      const { numero } = resultado.dados;
      chamadoNovo.marcar(numero);
      void consultas.invalidateQueries({ queryKey: chaveDaConversa(conversa) });
      void consultas.invalidateQueries({ queryKey: CHAVE_DOS_CHAMADOS_DO_CHAT });
      void consultas.invalidateQueries({ queryKey: CHAVE_DO_RESUMO_DO_CHAT });
      avisar({
        situacao: 'sucesso',
        titulo: `Chamado #${numero} aberto.`,
        aoAbrir: () => void roteador.navigate({ href: `/chat/chamados/${numero}` }),
      });
      fechar();
    } finally {
      definirEnviando(false);
    }
  }

  return (
    <form ref={formulario} className={estilos.formulario} noValidate onSubmit={abrir}>
      <MensagemCitada citada={citada} />
      <TiposDoChamado
        consulta={tipos}
        valor={tipo?.id ?? null}
        aoEscolher={escolherTipo}
        recusa={recusas.tipo}
      />
      <CampoDeTexto
        rotulo="Título"
        value={titulo}
        onChange={(texto) => {
          definirTitulo(texto);
          tirarRecusas('titulo');
        }}
        contador={{ maximo: LIMITE_DO_TITULO_DO_CHAMADO, contar: tamanhoDoTitulo }}
        erro={recusas.titulo}
      />
      {tipo?.pedeOAtivo && (
        <AtivoSugerido
          tipo={tipo}
          consulta={sugeridos}
          ativo={ativo}
          pessoa={pessoa}
          aoEscolher={(id) => {
            definirAtivoEscolhido(id);
            tirarRecusas('ativo');
          }}
          recusa={recusas.ativo}
        />
      )}
      <NoNomeDe pessoa={pessoa} aoEscolher={escolherPessoa} recusa={recusas.pessoa} />
      {falha && <Recusa texto={falha} />}
      <div className={estilos.acoes}>
        <Botao onPress={fechar}>Cancelar</Botao>
        <Botao
          type="submit"
          nivel="primario"
          icone={LifeBuoy}
          isDisabled={semAcao}
          carregando={enviando}
          rotuloCarregando="Abrindo o chamado"
        >
          Abrir chamado
        </Botao>
      </div>
    </form>
  );
}

/** A mensagem citada como ela é: quem escreveu e a hora em cima, e o texto, com o fio do chamado. */
function MensagemCitada({ citada }: { citada: MensagemATransformar }) {
  const dataHora = useDataHora();
  return (
    <figure className={estilos.citada}>
      <figcaption className={estilos.quem}>
        <span className={estilos.autor}>{citada.autor}</span>
        <span className={estilos.paraOLeitor}> · </span>
        <time className={estilos.hora} dateTime={citada.mensagem.criadaEm}>
          {dataHora.formatarHora(new Date(citada.mensagem.criadaEm))}
        </time>
      </figcaption>
      {citada.mensagem.texto && (
        <blockquote className={estilos.texto}>{citada.mensagem.texto}</blockquote>
      )}
    </figure>
  );
}

/**
 * Os tipos que o chat oferece, em chips com o ícone, que quebram em linhas, na ordem dos tipos; a
 * escolha é um rádio, e as setas andam entre eles. No lugar deles, os tipos carregando, a falha, com
 * "Tentar de novo", ou nenhum tipo para o chat.
 */
function TiposDoChamado({
  consulta,
  valor,
  aoEscolher,
  recusa,
}: {
  consulta: ReturnType<typeof useTiposDaAberturaPeloChat>;
  valor: string | null;
  aoEscolher: (id: string) => void;
  recusa: string | undefined;
}) {
  if (consulta.isPending) {
    return (
      <p role="status" className={estilos.estado}>
        Carregando os tipos…
      </p>
    );
  }
  if (consulta.isError) {
    return (
      <FalhaDoChat
        mensagem={consulta.error.message}
        relendo={consulta.isFetching}
        tentarDeNovo={() => void consulta.refetch()}
      />
    );
  }
  if (consulta.data.itens.length === 0) {
    return (
      <p className={estilos.estado}>
        Nenhum tipo de chamado está disponível para abrir pelo chat. Escreva à TI.
      </p>
    );
  }
  return (
    <GrupoDeRadios
      rotulo="Tipo"
      value={valor}
      onChange={aoEscolher}
      erro={recusa}
      className={estilos.tipos}
    >
      {consulta.data.itens.map((tipo) => (
        <Radio key={tipo.id} value={tipo.id} className={estilos.tipo}>
          <Icone icone={ICONES_DOS_TIPOS_DE_CHAMADO[tipo.icone]} />
          {tipo.nome}
        </Radio>
      ))}
    </GrupoDeRadios>
  );
}

/**
 * O ativo sugerido, no tipo que pede o ativo: o primeiro dos sugeridos para a pessoa, com o nome e o
 * patrimônio, e "Trocar", que lista os sugeridos. Sem nenhum, a frase da recusa da abertura.
 */
function AtivoSugerido({
  tipo,
  consulta,
  ativo,
  pessoa,
  aoEscolher,
  recusa,
}: {
  tipo: TipoParaAbrirPeloChat;
  consulta: ReturnType<typeof useAtivosSugeridosPeloChat>;
  ativo: AtivoSugeridoPeloChat | null;
  pessoa: PessoaDoChamado | null;
  aoEscolher: (id: string) => void;
  recusa: string | undefined;
}) {
  const idDoRotulo = useId();
  let conteudo: ReactNode;
  if (pessoa === null) {
    conteudo = <p className={estilos.estado}>Escolha a pessoa para ver os ativos sugeridos.</p>;
  } else if (consulta.isPending) {
    conteudo = (
      <p role="status" className={estilos.estado}>
        Carregando os ativos sugeridos…
      </p>
    );
  } else if (consulta.isError) {
    conteudo = (
      <FalhaDoChat
        mensagem={consulta.error.message}
        relendo={consulta.isFetching}
        tentarDeNovo={() => void consulta.refetch()}
      />
    );
  } else if (!ativo) {
    conteudo = <Recusa texto={recusa ?? semAtivoSugerido(pessoa.nome)} />;
  } else {
    conteudo = (
      <>
        <fieldset
          className={estilos.linhaDaEscolha}
          aria-labelledby={idDoRotulo}
          data-recusada={recusa ? true : undefined}
        >
          <span className={estilos.iconeDoAtivo}>
            <Icone icone={ICONES_DOS_TIPOS_DE_CHAMADO[tipo.icone]} tamanho={24} />
          </span>
          <span className={estilos.escolhido}>
            <span className={estilos.nomeDoEscolhido}>{ativo.nome}</span>
            {ativo.patrimonio && <span className={estilos.patrimonio}>{ativo.patrimonio}</span>}
          </span>
          <Menu
            rotulo="Ativos sugeridos"
            nomePeloRotulo
            opaco
            posicao="bottom end"
            gatilho={
              <Botao
                aria-label="Trocar o ativo"
                className={estilos.trocar}
                data-recusado={recusa ? true : undefined}
              >
                Trocar
              </Botao>
            }
          >
            <SecaoDeMenu
              aria-label="Ativo do chamado"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[ativo.id]}
              onSelectionChange={(chaves) => {
                if (chaves === 'all') return;
                const [escolhido] = [...chaves];
                if (typeof escolhido === 'string') aoEscolher(escolhido);
              }}
            >
              {(consulta.data?.ativos ?? []).map((sugerido) => (
                <ItemDeMenu
                  key={sugerido.id}
                  id={sugerido.id}
                  descricao={
                    sugerido.patrimonio ? (
                      <span className={estilos.patrimonio}>{sugerido.patrimonio}</span>
                    ) : undefined
                  }
                >
                  {sugerido.nome}
                </ItemDeMenu>
              ))}
            </SecaoDeMenu>
          </Menu>
        </fieldset>
        {recusa && <Recusa texto={recusa} />}
      </>
    );
  }
  return (
    <div className={estilos.campo}>
      <span id={idDoRotulo} className={estilos.rotulo}>
        Ativo sugerido
      </span>
      {conteudo}
    </div>
  );
}

/**
 * "No nome de": a pessoa do chamado, de começo a da conta que abre, com "Trocar", que busca as
 * pessoas ativas pelo nome.
 */
function NoNomeDe({
  pessoa,
  aoEscolher,
  recusa,
}: {
  pessoa: PessoaDoChamado | null;
  aoEscolher: (pessoa: PessoaDoChamado) => void;
  recusa: string | undefined;
}) {
  const idDoRotulo = useId();
  const [buscando, definirBuscando] = useState(false);
  return (
    <div className={estilos.campo}>
      <span id={idDoRotulo} className={estilos.rotulo}>
        No nome de
      </span>
      <fieldset
        className={estilos.linhaDaEscolha}
        aria-labelledby={idDoRotulo}
        data-recusada={recusa ? true : undefined}
      >
        {pessoa ? (
          <>
            <Avatar nome={pessoa.nome} decorativo className={estilos.fotoDaPessoa} />
            <span className={estilos.nomeDoEscolhido}>{pessoa.nome}</span>
          </>
        ) : (
          <span className={estilos.ninguem}>Ninguém escolhido</span>
        )}
        <Popover
          titulo="Trocar a pessoa"
          ocultarTitulo
          opaco
          posicao="bottom end"
          aberto={buscando}
          aoMudarAberto={definirBuscando}
          gatilho={
            <Botao
              aria-label="Trocar a pessoa"
              className={estilos.trocar}
              data-recusado={recusa ? true : undefined}
            >
              Trocar
            </Botao>
          }
        >
          <BuscaDaPessoa
            aoEscolher={(escolhida) => {
              aoEscolher(escolhida);
              definirBuscando(false);
            }}
          />
        </Popover>
      </fieldset>
      {recusa && <Recusa texto={recusa} />}
    </div>
  );
}

/** A busca das pessoas ativas pelo nome, na API, enquanto se digita; sem o texto, as primeiras. */
function BuscaDaPessoa({ aoEscolher }: { aoEscolher: (pessoa: PessoaDoChamado) => void }) {
  const [texto, definirTexto] = useState('');
  const busca = texto.trim();
  const pessoas = usePessoasParaOChamado(busca, true);
  const achadas = pessoas.data?.pessoas ?? [];
  const ninguem =
    busca !== '' && pessoas.isSuccess && !pessoas.isPlaceholderData && achadas.length === 0;
  return (
    <div className={estilos.busca}>
      <BuscaComSugestoes
        rotulo="Pessoa"
        placeholder="Digite o nome"
        autoFocus
        sugestoes={achadas.map(({ id, nome }) => ({ id, rotulo: nome }))}
        sugestoesDeFora
        manterOrdem
        total={pessoas.data?.total}
        aceitaTextoLivre={false}
        inputValue={texto}
        onInputChange={definirTexto}
        onSelectionChange={(chave) => {
          const escolhida = achadas.find(({ id }) => id === chave);
          if (escolhida) aoEscolher({ id: escolhida.id, nome: escolhida.nome });
        }}
        descricao={ninguem ? 'Nenhuma pessoa ativa com esse nome.' : undefined}
        erro={pessoas.isError ? pessoas.error.message : undefined}
      />
    </div>
  );
}
