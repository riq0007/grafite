// A lista da vista Chamados (spec modulo-chat, "Vista Chamados"; change chat-com-chamados, design,
// decisão 15; m10): o título, com a contagem dos abertos, e os grupos pela vez de quem age, só os que
// têm chamados: AGUARDANDO VOCÊ, EM ANDAMENTO, ABERTOS e FECHADOS, recolhido, com os resolvidos e os
// fechados, que carrega mais ao rolar. Cada chamado leva o ícone do tipo, o selo, a hora e o começo
// da última mensagem, com quem a escreveu. O chamado do endereço fica marcado.
import { type GrupoDaVistaChamados, gruposDaVistaChamados } from '@grafite/domain';
import { Botao, Icone, useDataHora } from '@grafite/ui';
import { useRouterState } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { type RefObject, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ICONES_DOS_TIPOS_DE_CHAMADO } from '../modulos/chamados/icones.ts';
import { Contador, contagemEmTexto, nomeParaOLeitor } from './Contador.tsx';
import { horaNaLista, quemEscreveuNaLista } from './chamado.ts';
import { useChamadosDaVista } from './consultas.ts';
import { FalhaDoChat } from './FalhaDoChat.tsx';
import { useAgoraNoChat } from './janela.ts';
import { LinkDoChat } from './LinkDoChat.tsx';
import lista from './ListaDoChat.module.css';
import { type ChamadoNaLista, chamadoDoEndereco, comAsDatas } from './ListaDoChat.tsx';
import estilos from './ListaDosChamados.module.css';
import moldura from './MolduraDoChat.module.css';
import { SeloDoChamado } from './SeloDoChamado.tsx';

const TITULOS_DOS_GRUPOS: Readonly<Record<GrupoDaVistaChamados, string>> = {
  'aguardando-voce': 'Aguardando você',
  'em-andamento': 'Em andamento',
  abertos: 'Abertos',
  fechados: 'Fechados',
};

/** A contagem dos abertos ao lado do título, como "3 abertos". */
const abertosEmTexto = (quantos: number) =>
  quantos === 0 ? 'nenhum aberto' : `${quantos} ${quantos === 1 ? 'aberto' : 'abertos'}`;

/** FECHADOS carrega a página seguinte quando o fim dele chega a 160 px da área, como a conversa. */
const ANTES_DO_FIM = '0px 0px 160px 0px';

export function ListaDosChamados() {
  const idDoTitulo = useId();
  const consulta = useChamadosDaVista(true);
  const escolhido = useRouterState({ select: chamadoDoEndereco });
  const rolagem = useRef<HTMLDivElement>(null);

  const paginas = consulta.data?.pages;
  const grupos = useMemo(() => {
    if (!paginas) return null;
    // O mesmo chamado em duas páginas, num instante de releitura, fica uma vez.
    const porNumero = new Map<number, ChamadoNaLista>();
    for (const pagina of paginas) {
      for (const chamado of [...pagina.abertos, ...pagina.resolvidos]) {
        porNumero.set(chamado.numero, comAsDatas(chamado));
      }
    }
    return gruposDaVistaChamados([...porNumero.values()]);
  }, [paginas]);
  const abertos = paginas?.[0]?.abertos.length ?? null;

  return (
    <section aria-labelledby={idDoTitulo} className={`${moldura.lista} ${lista.lista}`}>
      <div className={estilos.cabecalho}>
        <h1 id={idDoTitulo} className={lista.titulo}>
          Chamados
        </h1>
        {abertos !== null && <p className={estilos.contagem}>{abertosEmTexto(abertos)}</p>}
      </div>
      <div ref={rolagem} className={lista.secoes}>
        {consulta.isPending && (
          <p role="status" className={estilos.aviso}>
            Carregando os seus chamados…
          </p>
        )}
        {consulta.isError && !consulta.data && (
          <FalhaDoChat
            mensagem={consulta.error.message}
            relendo={consulta.isFetching}
            tentarDeNovo={() => void consulta.refetch()}
          />
        )}
        {grupos?.length === 0 && <p className={estilos.aviso}>Nenhum chamado.</p>}
        {grupos?.map(({ grupo, chamados }) =>
          grupo === 'fechados' ? (
            <GrupoDosFechados
              key={grupo}
              chamados={chamados}
              escolhido={escolhido}
              rolagem={rolagem}
              temMais={consulta.hasNextPage}
              carregando={consulta.isFetchingNextPage}
              falha={consulta.isFetchNextPageError ? consulta.error.message : null}
              carregarMais={() => void consulta.fetchNextPage()}
            />
          ) : (
            <div key={grupo} className={lista.secao}>
              <h2 className={lista.tituloDaSecao}>
                {`${TITULOS_DOS_GRUPOS[grupo]} · ${chamados.length}`}
              </h2>
              <ul className={lista.itens}>
                {chamados.map((chamado) => (
                  <CartaoDoChamado
                    key={chamado.numero}
                    chamado={chamado}
                    escolhido={chamado.numero === escolhido}
                  />
                ))}
              </ul>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

/**
 * FECHADOS · N, recolhido, com os resolvidos e os fechados, o resolvido mais novo primeiro, e "+"
 * enquanto há mais para carregar. Aberto, ele carrega a página seguinte quando o fim chega perto
 * da área, e pelo botão; a falha diz o motivo e espera o "Tentar de novo". A seção abre sozinha
 * quando o chamado do endereço é um deles, e quem a fecha a fecha, até outro deles ser escolhido.
 */
function GrupoDosFechados({
  chamados,
  escolhido,
  rolagem,
  temMais,
  carregando,
  falha,
  carregarMais,
}: {
  chamados: readonly ChamadoNaLista[];
  escolhido: number | null;
  rolagem: RefObject<HTMLDivElement | null>;
  temMais: boolean;
  carregando: boolean;
  falha: string | null;
  carregarMais: () => void;
}) {
  const idDosItens = useId();
  const [aberta, definirAberta] = useState(false);
  const doEscolhido =
    escolhido !== null && chamados.some(({ numero }) => numero === escolhido) ? escolhido : null;
  const [abertaPor, definirAbertaPor] = useState<number | null>(null);
  if (doEscolhido !== abertaPor) {
    definirAbertaPor(doEscolhido);
    if (doEscolhido !== null) definirAberta(true);
  }

  // O observador novo, a cada página que chega, diz se o fim ainda está perto, para carregar a
  // seguinte.
  const fim = useRef<HTMLDivElement>(null);
  const carregarAgora = useRef(carregarMais);
  carregarAgora.current = carregarMais;
  const quantos = chamados.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: o observador novo, a cada página que chega, diz de novo se o fim está perto.
  useEffect(() => {
    const alvo = fim.current;
    if (!aberta || !temMais || carregando || falha !== null || !alvo) return;
    if (typeof IntersectionObserver !== 'function') return;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) carregarAgora.current();
      },
      { root: rolagem.current, rootMargin: ANTES_DO_FIM },
    );
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [aberta, temMais, carregando, falha, quantos, rolagem]);

  return (
    <div className={lista.secao}>
      <h2 className={lista.tituloDaSecao}>
        <button
          type="button"
          className={lista.recolher}
          aria-expanded={aberta}
          aria-controls={aberta ? idDosItens : undefined}
          onClick={() => definirAberta(!aberta)}
        >
          <Icone icone={ChevronRight} tamanho={14} />
          {`${TITULOS_DOS_GRUPOS.fechados} · ${quantos}${temMais ? '+' : ''}`}
        </button>
      </h2>
      {aberta && (
        <div id={idDosItens} className={lista.abrindo}>
          <ul className={lista.itens}>
            {chamados.map((chamado) => (
              <CartaoDoChamado
                key={chamado.numero}
                chamado={chamado}
                escolhido={chamado.numero === escolhido}
              />
            ))}
          </ul>
          {temMais && (
            <div ref={fim} className={estilos.fimDosFechados}>
              {falha !== null ? (
                <FalhaDoChat mensagem={falha} relendo={carregando} tentarDeNovo={carregarMais} />
              ) : (
                <Botao
                  nivel="terciario"
                  carregando={carregando}
                  rotuloCarregando="Carregando"
                  onPress={carregarMais}
                >
                  Carregar mais
                </Botao>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * O chamado no cartão da vista Chamados (m10): o número em mono, o selo e a hora da última mensagem
 * no alto; o ícone do tipo e o título inteiro, que quebra a linha e não corta; e o começo da última
 * mensagem, com quem a escreveu, cortado pela largura, com o contador da resposta nova. Sem mensagem,
 * a hora é a da abertura. O link leva a vista na busca, para a lista ficar ao lado do chamado.
 */
function CartaoDoChamado({ chamado, escolhido }: { chamado: ChamadoNaLista; escolhido: boolean }) {
  const dataHora = useDataHora();
  const agora = useAgoraNoChat();
  const ultima = chamado.ultimaMensagem;
  const hora = horaNaLista(new Date(ultima?.em ?? chamado.abertoEm), agora, dataHora);
  const quem = ultima ? quemEscreveuNaLista(ultima) : null;
  const comeco = ultima ? (quem ? `${quem}: ${ultima.comeco}` : ultima.comeco) : null;
  return (
    <li>
      <LinkDoChat
        para={`/chat/chamados/${chamado.numero}?vista=chamados`}
        aria-current={escolhido ? 'page' : undefined}
        aria-label={nomeParaOLeitor(
          chamado.titulo,
          chamado.situacaoEmTexto,
          `chamado ${chamado.numero}`,
          contagemEmTexto(chamado.respostaNova, 'resposta nova', 'respostas novas'),
          comeco,
          hora,
        )}
        className={lista.chamado}
      >
        <span className={estilos.linhaDeCima}>
          <span className={estilos.numero}>{`#${chamado.numero}`}</span>
          <SeloDoChamado texto={chamado.situacaoEmTexto} />
          <span className={estilos.hora}>{hora}</span>
        </span>
        <span className={estilos.titulo}>
          <Icone icone={ICONES_DOS_TIPOS_DE_CHAMADO[chamado.tipo.icone]} tamanho={16} />
          <span className={estilos.textoDoTitulo}>{chamado.titulo}</span>
        </span>
        {(comeco !== null || chamado.respostaNova > 0) && (
          <span className={estilos.ultima}>
            <span className={estilos.comeco}>{comeco}</span>
            <Contador quantos={chamado.respostaNova} tom="chamado" />
          </span>
        )}
      </LinkDoChat>
    </li>
  );
}
