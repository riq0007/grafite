// O chamado aberto (spec modulo-chamados, "Chamado aberto"; change chamados-da-ti, design, "O
// chamado aberto, o cabeçalho (tarefa 5.10)"; mockup m03): o endereço `/chamados/<número>`, que as
// notificações, o quadro e a busca abrem, e o cabeçalho da página do kit, com a trilha, a seta de
// voltar (tarefa 5.32), o título e o número, o selo, o tipo, quem pediu e quem atende, o quadro do
// prazo e as ações de cada situação, e, embaixo, a conversa (tarefa 5.11) e o campo de escrever
// (tarefa 5.12), com a coluna da direita ao lado (tarefa 5.13, m04). O resolvido diz até quando se
// reabre, "fecha em 18/11", e o fechado tem o selo Fechado, sem as ações (change chat-com-chamados,
// tarefa 4.13).
import {
  AreaDeTexto,
  Botao,
  BotaoDeIcone,
  CabecalhoDaPagina,
  CampoDeTexto,
  type DataHora,
  Dialogo,
  EstadoVazio,
  Icone,
  ItemDeMenu,
  LugarDeSoltar,
  MensagemDoPasso,
  Menu,
  useDataHora,
} from '@grafite/ui';
import { Link, useCanGoBack, useNavigate, useParams, useRouter } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowLeftRight,
  ChevronRight,
  CircleCheck,
  Droplet,
  HandGrab,
  type LucideIcon,
  MessageSquareText,
  RotateCcw,
  Wrench,
} from 'lucide-react';
import { Fragment, type ReactNode, useState } from 'react';
import { FalhaDaConsulta } from '../../../api/consultas.ts';
import { useAgora } from '../../../casca/status/useAgora.ts';
import { diaDoReabrir } from '../../../chat/chamado.ts';
import { useJanelaAVista } from '../../../chat/janela.ts';
import { useChamadoAVista } from '../../../notificacoes/destinosAVista.tsx';
import { useAcesso } from '../../../sessao/useAcesso.ts';
import { useServidor, useSessao } from '../../../sessao/useSessao.tsx';
import { useArvoreDosLocais } from '../../administracao/seletores/SeletorDeLocal.tsx';
import {
  GavetaDoTonerDoChamado,
  type RegistroDoTonerDoChamado,
} from '../../operacao/solicitacoes/Formulario.tsx';
import { useAcoesDoAtendimento } from '../acoes.ts';
import { type FichaDoChamado, useFichaDoChamado, useQuadroDosChamados } from '../consultas.ts';
import { IconeDoPrazo, IconeDoTipo, Selo, SiglaDaPessoa } from '../Pecas.tsx';
import { PERMISSOES_DE_VER } from '../permissoes.ts';
import { ALVO_DA_TRIAGEM, type ChamadoArrastado } from '../quadro/arraste.ts';
import { acoesDoChamado, momentoDaMensagem, pessoasParaPassar } from '../quadro/previa.ts';
import { chaveDaColuna, textoDosAbertos } from '../quadro/quadro.ts';
import { TelaDosChamados } from '../TelaDosChamados.tsx';
import { type RecusaNoDialogo, useAcoesDoChamadoAberto } from './acoes.ts';
import { CampoDeEscrever } from './CampoDeEscrever.tsx';
import estilos from './Chamado.module.css';
import { Conversa } from './Conversa.tsx';
import { ID_DO_CAMPO_DE_ESCREVER } from './escrever.ts';
import { LadoDoChamado } from './Lado.tsx';
import { type AcoesDoAtivo, acoesDoAtivo } from './lado.ts';
import { quadroDoPrazo } from './prazo.ts';
import { GavetaDoVirarOs } from './VirarOs.tsx';

const NAO_ENCONTRADO = 'Chamado não encontrado.';

/** O chamado aberto, para quem vê os chamados. */
export function ChamadoAberto() {
  return (
    <TelaDosChamados titulo="Chamado" permissoes={PERMISSOES_DE_VER} semAcesso="aos chamados">
      <ConteudoDoChamado />
    </TelaDosChamados>
  );
}

/**
 * O número do endereço que não é de um chamado, o 400 e o 404 da API: o chamado que não existe e o
 * que a conta não vê dizem o mesmo.
 */
const naoEncontrado = (erro: Error | null) =>
  erro instanceof FalhaDaConsulta &&
  (erro.falha.problema?.status === 400 || erro.falha.problema?.status === 404);

function ConteudoDoChamado() {
  const { numero: doEndereco } = useParams({ from: '/chamados/$numero' });
  const numero = /^\d{1,9}$/.test(doEndereco) ? Number(doEndereco) : null;
  const consulta = useFichaDoChamado(numero);
  // O chamado que sai do alcance da conta numa releitura deixa de aparecer.
  const sumiu = naoEncontrado(consulta.error);
  if (consulta.data && !sumiu) return <Chamado ficha={consulta.data} />;

  let conteudo: ReactNode;
  if (numero === null || sumiu) {
    conteudo = <EstadoVazio className={estilos.estado} titulo={NAO_ENCONTRADO} />;
  } else if (consulta.isError) {
    conteudo = (
      <EstadoVazio
        className={estilos.estado}
        titulo={consulta.error.message}
        acao={
          <Botao
            carregando={consulta.isFetching}
            rotuloCarregando="Tentando de novo"
            onPress={() => void consulta.refetch()}
          >
            Tentar de novo
          </Botao>
        }
      />
    );
  } else {
    conteudo = (
      <p role="status" className={estilos.estado}>
        Carregando o chamado…
      </p>
    );
  }
  return (
    <div className={estilos.tela} data-janela-inteira="">
      <CabecalhoDaPagina
        trilha={<Trilha numero={numero === null || sumiu ? null : numero} />}
        voltar={<Voltar />}
        titulo={
          numero === null || sumiu ? (
            'Chamado'
          ) : (
            <span className={estilos.numeroDoTitulo}>{`#${numero}`}</span>
          )
        }
      />
      {conteudo}
    </div>
  );
}

function Chamado({ ficha }: { ficha: FichaDoChamado }) {
  const agora = useAgora();
  const dataHora = useDataHora();
  const { pode } = useAcesso();
  const operacaoLigada = !(useServidor()?.modulosDesligados ?? []).includes('operacao');
  const doAtivo = acoesDoAtivo(ficha, { operacaoLigada, pode });
  // As notificações deste chamado, nos dois endereços dele, como a resposta da pessoa, não viram
  // aviso enquanto ele está à vista.
  useChamadoAVista(ficha.numero, useJanelaAVista());
  // Cada envio do campo de escrever leva a conversa à última mensagem.
  const [envios, definirEnvios] = useState(0);
  return (
    // A conversa e a coluna da direita rolam sozinhas, entre o cabeçalho e o campo de escrever
    // (design, "O chamado aberto, a conversa (tarefa 5.11)" e "A coluna da direita").
    <div className={estilos.tela} data-janela-inteira="rola-por-dentro">
      <CabecalhoDaPagina
        trilha={<Trilha tipo={ficha.tipo.nome} numero={ficha.numero} />}
        voltar={<Voltar />}
        titulo={
          <>
            {ficha.titulo} <span className={estilos.numeroDoTitulo}>{`#${ficha.numero}`}</span>
          </>
        }
        detalhe={<DadosDoChamado ficha={ficha} agora={agora} dataHora={dataHora} />}
        quadro={<QuadroDoPrazoDoChamado ficha={ficha} agora={agora} dataHora={dataHora} />}
        acoes={
          ficha.permite.atender &&
          !ficha.fechado && <AcoesDoChamado ficha={ficha} doAtivo={doAtivo} />
        }
      />
      <div className={estilos.corpo}>
        {/* A conversa e o campo são o lugar de soltar os anexos do campo; sem ele, como no fechado,
            ninguém recebe (change chat-com-chamados, tarefa 4.19). */}
        <LugarDeSoltar className={estilos.principal}>
          <Conversa key={ficha.numero} ficha={ficha} envios={envios} />
          <CampoDeEscrever
            // O rascunho é de um chamado: o outro abre com o campo vazio.
            key={`campo-${ficha.numero}`}
            ficha={ficha}
            aoEnviar={() => definirEnvios((antes) => antes + 1)}
          />
        </LugarDeSoltar>
        <LadoDoChamado ficha={ficha} acoes={doAtivo} />
      </div>
    </div>
  );
}

/**
 * A seta de voltar (design, "A seta de voltar no chamado aberto (tarefa 5.32)"): volta à tela de
 * antes, quando o chamado abriu de outra tela do app, como o quadro, o Início ou uma notificação, e,
 * com o chamado aberto direto pelo endereço, leva ao Início dos chamados.
 */
function Voltar() {
  const roteador = useRouter();
  const podeVoltar = useCanGoBack();
  const navegar = useNavigate();
  return (
    <BotaoDeIcone
      icone={ArrowLeft}
      rotulo="Voltar"
      onPress={() => {
        if (podeVoltar) roteador.history.back();
        else void navegar({ to: '/chamados' });
      }}
    />
  );
}

/** "Chamados › Acesso e senha › #1041": o "Chamados" leva ao Início dos chamados. */
function Trilha({ tipo, numero }: { tipo?: string; numero: number | null }) {
  const seta = <Icone icone={ChevronRight} tamanho={12} />;
  return (
    <nav aria-label="Trilha" className={estilos.trilha}>
      <ol>
        <li>
          <Link to="/chamados">Chamados</Link>
        </li>
        {tipo && (
          <li>
            {seta}
            {tipo}
          </li>
        )}
        {numero !== null && (
          <li>
            {seta}
            <span aria-current="page" className={estilos.numero}>{`#${numero}`}</span>
          </li>
        )}
      </ol>
    </nav>
  );
}

/**
 * O desde de quem atende, na hora da mensagem: "atende desde ontem, 17:20" e, hoje, "atende desde
 * as 09:40", como no m04.
 */
function desdeDeQuemAtende(desde: Date, agora: Date, dataHora: DataHora): string {
  const momento = momentoDaMensagem(desde, agora, dataHora);
  return dataHora.grupoDoDia(desde, agora) === 'Hoje'
    ? `atende desde as ${momento}`
    : `atende desde ${momento}`;
}

/**
 * O selo, o tipo, quem pediu e quem atende; na triagem, ninguém atende, e o selo o diz. O resolvido
 * diz, junto do selo, o último dia em que se reabre, e o fechado tem o selo Fechado.
 */
function DadosDoChamado({
  ficha: { situacao, tipo, pessoa, responsavel, fechado, reabrirAte },
  agora,
  dataHora,
}: {
  ficha: FichaDoChamado;
  agora: Date;
  dataHora: DataHora;
}) {
  return (
    <div className={estilos.dados}>
      <span className={estilos.situacao}>
        <Selo selo={fechado ? 'fechado' : situacao} />
        {situacao === 'resolvido' && !fechado && reabrirAte !== null && (
          <span
            className={estilos.fecha}
          >{`fecha em ${diaDoReabrir(reabrirAte, agora, dataHora)}`}</span>
        )}
      </span>
      <span className={estilos.tipo}>
        <IconeDoTipo icone={tipo.icone} nome={tipo.nome} decorativo />
        {tipo.nome}
      </span>
      <span className={estilos.quem}>
        <SiglaDaPessoa conta={null} nome={pessoa.nome} tamanho="pequena" />
        <b>{pessoa.nome}</b>
        {pessoa.local && <span>{`· ${pessoa.local}`}</span>}
      </span>
      {responsavel && (
        <span className={estilos.quem}>
          <SiglaDaPessoa conta={responsavel.conta} nome={responsavel.nome} tamanho="pequena" />
          <b>{responsavel.nome}</b>
          <span>
            {responsavel.naoAtendeMais
              ? '· não atende mais os chamados'
              : `· ${desdeDeQuemAtende(new Date(responsavel.desde), agora, dataHora)}`}
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * O quadro do prazo, à direita: o prazo do tipo, a situação em destaque, com a cor só no estourado
 * e no que vence em até 2 h, o detalhe no tempo do relógio e a primeira resposta pendente.
 */
function QuadroDoPrazoDoChamado({
  ficha,
  agora,
  dataHora,
}: {
  ficha: FichaDoChamado;
  agora: Date;
  dataHora: DataHora;
}) {
  const quadro = quadroDoPrazo(ficha, ficha.horario, agora, dataHora);
  return (
    <div
      className={estilos.prazo}
      data-marca={quadro.marca === 'neutra' ? undefined : quadro.marca}
    >
      {quadro.prazoDoTipo && <span className={estilos.linhaDoPrazo}>{quadro.prazoDoTipo}</span>}
      <b className={estilos.destaque}>
        <IconeDoPrazo grupo={quadro.grupo} tamanho={20} />
        {quadro.destaque}
      </b>
      <span className={estilos.linhaDoPrazo}>
        {quadro.detalhe.map((pedaco, indice) => (
          <Fragment key={pedaco.texto}>
            {indice > 0 && ' · '}
            {pedaco.mono ? <span className={estilos.mono}>{pedaco.texto}</span> : pedaco.texto}
          </Fragment>
        ))}
      </span>
      {quadro.resposta && (
        <span
          className={estilos.linhaDoPrazo}
          data-atrasada={quadro.resposta.atrasada ? '' : undefined}
        >
          {quadro.resposta.texto}
        </span>
      )}
    </div>
  );
}

/** O chamado como a regra de quem recebe o lê, para o "Transferir". */
function comoArrastado({
  numero,
  situacao,
  responsavel,
  pessoa,
  locais,
  semLocal,
}: FichaDoChamado): ChamadoArrastado {
  return {
    numero,
    situacao,
    responsavel: responsavel?.conta ?? null,
    origem: responsavel ? chaveDaColuna(responsavel) : ALVO_DA_TRIAGEM,
    pessoa: pessoa.nome,
    locais,
    semLocal,
  };
}

/**
 * As ações de quem atende os locais do chamado, na ordem do m03 e do m04: "Assumir", fora do que
 * está com a conta, "Transferir", "Virar OS" e "Pedir toner", pela regra do ativo (`acoesDoAtivo`),
 * "Resolver" e "Responder", a principal. No resolvido, só "Reabrir". O botão que espera a resposta
 * gira, e os outros esperam com ele.
 */
function AcoesDoChamado({ ficha, doAtivo }: { ficha: FichaDoChamado; doAtivo: AcoesDoAtivo }) {
  const sessao = useSessao();
  const conta = sessao.tipo === 'ativa' ? sessao.conta.id : null;
  const acoes = useAcoesDoAtendimento();
  const doChamado = useAcoesDoChamadoAberto();
  const [esperando, definirEsperando] = useState<string | null>(null);
  // O registro do Toner que o "Pedir toner" deu, aberto na gaveta.
  const [registro, definirRegistro] = useState<RegistroDoTonerDoChamado | null>(null);
  // A gaveta do "Virar OS" aberta.
  const [virando, definirVirando] = useState(false);
  const { numero, versao, situacao, ativo } = ficha;

  const agir = async (botao: string, fazer: () => Promise<unknown>) => {
    if (esperando !== null) return;
    definirEsperando(botao);
    try {
      await fazer();
    } finally {
      definirEsperando(null);
    }
  };
  const doBotao = (botao: string) => ({
    carregando: esperando === botao,
    isDisabled: esperando !== null && esperando !== botao,
  });

  if (situacao === 'resolvido') {
    return (
      <Botao
        icone={RotateCcw}
        rotuloCarregando="Reabrindo"
        {...doBotao('reabrir')}
        onPress={() => void agir('reabrir', () => acoes.reabrir(numero, versao))}
      >
        Reabrir
      </Botao>
    );
  }

  const { assumir } = acoesDoChamado({ situacao, responsavel: ficha.responsavel }, conta);
  return (
    <>
      {assumir && (
        <Botao
          icone={HandGrab}
          rotuloCarregando="Assumindo"
          {...doBotao('assumir')}
          onPress={() => void agir('assumir', () => acoes.assumir(numero, versao))}
        >
          Assumir
        </Botao>
      )}
      <Transferir
        ficha={ficha}
        {...doBotao('transferir')}
        aoEscolher={(para) => void agir('transferir', () => acoes.passar(numero, versao, para))}
      />
      {ativo && doAtivo.virarOs && (
        <Botao icone={Wrench} isDisabled={esperando !== null} onPress={() => definirVirando(true)}>
          Virar OS
        </Botao>
      )}
      {virando && <GavetaDoVirarOs ficha={ficha} aoFechar={() => definirVirando(false)} />}
      {doAtivo.pedirToner && (
        <Botao
          icone={Droplet}
          rotuloCarregando="Pedindo toner"
          {...doBotao('toner')}
          onPress={() =>
            void agir('toner', async () => {
              const dado = await doChamado.pedirToner(numero);
              if (dado) definirRegistro(dado);
            })
          }
        >
          Pedir toner
        </Botao>
      )}
      {registro && (
        <GavetaDoTonerDoChamado
          chamado={numero}
          registro={registro}
          pessoa={{ id: registro.pessoa, rotulo: ficha.pessoa.nome }}
          aoPedir={doChamado.tonerPedido}
          aoFechar={() => definirRegistro(null)}
        />
      )}
      <DialogoComTexto
        gatilho="Resolver"
        icone={CircleCheck}
        desligado={esperando !== null}
        titulo={`Resolver o #${numero}`}
        campo={{ rotulo: 'O que foi feito', inicial: '', multilinha: true }}
        confirmar={{ rotulo: 'Resolver', carregando: 'Resolvendo' }}
        aoConfirmar={(feito) => doChamado.resolver(numero, versao, feito)}
      />
      <Botao
        nivel="primario"
        icone={MessageSquareText}
        isDisabled={esperando !== null}
        onPress={() => document.getElementById(ID_DO_CAMPO_DE_ESCREVER)?.focus()}
      >
        Responder
      </Botao>
    </>
  );
}

/**
 * "Transferir": o menu do "Passar para…", com as colunas do quadro e a regra do arraste
 * (`pessoasParaPassar`). Sem ninguém, o menu diz que ninguém mais atende os locais do chamado.
 */
function Transferir({
  ficha,
  carregando,
  isDisabled,
  aoEscolher,
}: {
  ficha: FichaDoChamado;
  carregando: boolean;
  isDisabled: boolean;
  aoEscolher: (conta: string) => void;
}) {
  const quadro = useQuadroDosChamados();
  const arvore = useArvoreDosLocais();
  let itens: ReactNode;
  if (quadro.data) {
    const pessoas = pessoasParaPassar(quadro.data.colunas, comoArrastado(ficha), arvore);
    itens =
      pessoas.length === 0 ? (
        <ItemDeMenu id="ninguem" isDisabled>
          Ninguém mais atende os locais do chamado.
        </ItemDeMenu>
      ) : (
        pessoas.map((pessoa) => (
          <ItemDeMenu
            key={pessoa.conta}
            id={pessoa.conta}
            descricao={textoDosAbertos(pessoa.abertos)}
            onAction={() => aoEscolher(pessoa.conta)}
          >
            {pessoa.nome}
          </ItemDeMenu>
        ))
      );
  } else {
    itens = (
      <ItemDeMenu id="carregando" isDisabled>
        {quadro.isError ? quadro.error.message : 'Carregando quem atende…'}
      </ItemDeMenu>
    );
  }
  return (
    <Menu
      rotulo={`Transferir o #${ficha.numero}`}
      gatilho={
        <Botao
          icone={ArrowLeftRight}
          carregando={carregando}
          rotuloCarregando="Transferindo"
          isDisabled={isDisabled}
        >
          Transferir
        </Botao>
      }
    >
      {itens}
    </Menu>
  );
}

/**
 * O diálogo de uma ação que pede um texto, como o "O que foi feito" do resolver e o problema da OS:
 * a recusa fica nele, no campo quando é do campo; a ação aceita fecha o diálogo.
 */
function DialogoComTexto({
  gatilho,
  icone,
  desligado,
  titulo,
  campo,
  confirmar,
  aoConfirmar,
}: {
  gatilho: string;
  icone: LucideIcon;
  desligado: boolean;
  titulo: string;
  campo: { rotulo: string; descricao?: string; inicial: string; multilinha?: boolean };
  confirmar: { rotulo: string; carregando: string };
  aoConfirmar: (texto: string) => Promise<RecusaNoDialogo | null>;
}) {
  const [aberto, definirAberto] = useState(false);
  const [texto, definirTexto] = useState('');
  const [erro, definirErro] = useState<string | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [tentativa, definirTentativa] = useState(0);
  const [enviando, definirEnviando] = useState(false);

  const mudarAberto = (abrir: boolean) => {
    if (enviando) return;
    if (abrir) {
      definirTexto(campo.inicial);
      definirErro(null);
      definirFalha(null);
    }
    definirAberto(abrir);
  };

  const enviar = async () => {
    if (enviando) return;
    definirEnviando(true);
    const recusa = await aoConfirmar(texto);
    definirEnviando(false);
    if (!recusa) {
      definirAberto(false);
      return;
    }
    if (recusa.doCampo) {
      definirErro(recusa.erro);
      return;
    }
    definirFalha(recusa.erro);
    definirTentativa((anterior) => anterior + 1);
  };

  const doCampo = {
    rotulo: campo.rotulo,
    descricao: campo.descricao,
    value: texto,
    onChange: (novo: string) => {
      definirTexto(novo);
      definirErro(null);
    },
    erro: erro ?? undefined,
  };
  return (
    <Dialogo
      gatilho={
        <Botao icone={icone} isDisabled={desligado}>
          {gatilho}
        </Botao>
      }
      titulo={titulo}
      aberto={aberto}
      aoMudarAberto={mudarAberto}
      acoes={(fechar) => (
        <>
          <Botao isDisabled={enviando} onPress={fechar}>
            Cancelar
          </Botao>
          <Botao
            nivel="primario"
            carregando={enviando}
            rotuloCarregando={confirmar.carregando}
            onPress={() => void enviar()}
          >
            {confirmar.rotulo}
          </Botao>
        </>
      )}
    >
      <div className={estilos.formulario}>
        {campo.multilinha ? (
          <AreaDeTexto {...doCampo} autoFocus />
        ) : (
          <CampoDeTexto {...doCampo} autoFocus autoComplete="off" />
        )}
        <MensagemDoPasso texto={falha} chave={tentativa} />
      </div>
    </Dialogo>
  );
}
