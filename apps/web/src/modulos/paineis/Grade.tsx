// A grade dos painéis (spec modulo-paineis, "Grade adaptativa" e "Expandir o painel"; change
// painel-de-dashboards, design, decisões 3, 4 e 5): os painéis ativos numa grade que ocupa a área da
// janela, com a forma do domínio, cada um com o nome, a situação, "Expandir" e "Abrir em outra aba".
// O expandido vem do endereço, que o mapa usa, e Esc volta à grade. O bloco segue a exibição do
// painel (change diagnostico-dos-paineis, design, decisão 4): o que recusa ser embutido diz o motivo
// no lugar do quadro em branco, e o que pede a entrada avisa acima do conteúdo.
import {
  EXIBICOES_DO_PAINEL_NA_TELA,
  formaDaGrade,
  SITUACOES_DO_PAINEL_NA_TELA,
} from '@grafite/domain';
import {
  Botao,
  CabecalhoDaPagina,
  EstadoVazio,
  RotuloDeSituacao,
  useDataHora,
  usePostura,
} from '@grafite/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ExternalLink, Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { SemPermissao } from '../administracao/SemPermissao.tsx';
import { type Painel, usePaineis } from './consultas.ts';
import estilos from './Paineis.module.css';

/** A grade não fica mais baixa que isto, em px, mesmo numa janela pequena. */
const ALTURA_MINIMA = 360;

function BlocoDoPainel({
  painel,
  expandido,
  aoExpandir,
}: {
  painel: Painel;
  expandido: boolean;
  aoExpandir: (expandir: boolean) => void;
}) {
  const { formatarDataEHora } = useDataHora();
  const situacao = SITUACOES_DO_PAINEL_NA_TELA[painel.verificacao.situacao];
  const pelaPonte = painel.endereco.startsWith('http:');
  // "Aparece na grade" é uma leitura da resposta, e não uma prova: o bloco só anuncia as outras.
  const exibicao = painel.exibicao?.situacao ?? 'aparece';
  const anunciada = exibicao === 'aparece' ? null : EXIBICOES_DO_PAINEL_NA_TELA[exibicao];
  return (
    <section
      className={estilos.bloco}
      aria-label={painel.nome}
      data-expandido={expandido || undefined}
    >
      <header className={estilos.topoDoBloco}>
        <h2 className={estilos.nomeDoPainel}>{painel.nome}</h2>
        <RotuloDeSituacao situacao={situacao.tom}>{situacao.texto}</RotuloDeSituacao>
        {anunciada && (
          <RotuloDeSituacao situacao={anunciada.tom}>{anunciada.texto}</RotuloDeSituacao>
        )}
        {painel.verificacao.momento && (
          <span className={estilos.nota}>
            {formatarDataEHora(new Date(painel.verificacao.momento))}
            {painel.verificacao.motivo ? ` · ${painel.verificacao.motivo}` : ''}
          </span>
        )}
        <span className={estilos.acoesDoBloco}>
          <Botao
            nivel="terciario"
            icone={expandido ? Minimize2 : Maximize2}
            onPress={() => aoExpandir(!expandido)}
          >
            {expandido ? 'Voltar à grade' : 'Expandir'}
          </Botao>
          <a className={estilos.abrir} href={painel.endereco} target="_blank" rel="noreferrer">
            <ExternalLink size={16} aria-hidden="true" />
            Abrir em outra aba
          </a>
        </span>
      </header>
      {exibicao === 'pede-entrada' && (
        <p className={estilos.avisoDoBloco}>
          Este painel pede a entrada. Se a tela de entrada voltar depois de entrar, use “Abrir em
          outra aba” ou libere a visualização sem entrada na ferramenta.
        </p>
      )}
      {exibicao === 'recusa' ? (
        // O endereço não é carregado: o navegador mostraria só o quadro em branco.
        <EstadoVazio
          className={estilos.recusa}
          titulo="Este endereço recusa ser mostrado dentro de outra página."
          descricao={[
            painel.exibicao?.motivo,
            'Libere o endereço do Grafite na ferramenta, ou use “Abrir em outra aba”.',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      ) : (
        <iframe
          className={estilos.conteudo}
          title={painel.nome}
          src={pelaPonte ? `/api/paineis/${painel.id}/exibicao` : painel.endereco}
          sandbox={
            pelaPonte
              ? 'allow-scripts allow-forms allow-popups'
              : 'allow-scripts allow-same-origin allow-forms allow-popups'
          }
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      )}
    </section>
  );
}

export function Grade() {
  const { pode } = useAcesso();
  const navegar = useNavigate();
  const busca = useSearch({ strict: false }) as { expandido?: string };
  const paineis = usePaineis();
  const celular = usePostura() === 'celular';
  const expandido = typeof busca.expandido === 'string' ? busca.expandido : null;
  const expandir = (id: string | null) =>
    void navegar({ to: '/paineis', search: id ? { expandido: id } : {}, replace: true });

  useEffect(() => {
    if (!expandido) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') void navegar({ to: '/paineis', search: {}, replace: true });
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [expandido, navegar]);

  // A grade vai até o fim da área da janela: a altura dela é medida, porque a área que rola não
  // tem altura definida para o 100%.
  const grade = useRef<HTMLDivElement>(null);
  const [altura, definirAltura] = useState<number | null>(null);
  const quantos = paineis.data?.paineis.length ?? 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a grade aparece quando os painéis chegam e muda com o expandido; a medida recomeça nesses momentos.
  useLayoutEffect(() => {
    const elemento = grade.current;
    const area = elemento?.closest<HTMLElement>('[data-rolagem-da-janela]');
    if (!elemento || !area) return;
    const medir = () => {
      const respiro = Number.parseFloat(getComputedStyle(area).paddingBottom) || 0;
      const sobra = area.getBoundingClientRect().bottom - elemento.getBoundingClientRect().top;
      definirAltura(Math.max(ALTURA_MINIMA, Math.floor(sobra - respiro)));
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(medir);
    observador.observe(area);
    return () => observador.disconnect();
  }, [quantos, expandido]);

  if (!pode('paineis.ver')) {
    return (
      <>
        <CabecalhoDaPagina titulo="Painéis" />
        <SemPermissao a="aos painéis" />
      </>
    );
  }

  const ativos = (paineis.data?.paineis ?? []).filter((painel) => painel.situacao === 'ativo');
  const emFoco = expandido ? ativos.find((painel) => painel.id === expandido) : undefined;
  const mostrados = emFoco ? [emFoco] : ativos;
  const { colunas, linhas } = formaDaGrade(mostrados.length);
  // No celular, um painel embaixo do outro, cada um com a altura da área, e a janela rola (change
  // telas-no-celular, design, decisão 3); o expandido continua sozinho na área.
  const empilhados = celular && mostrados.length > 1;
  const forma = empilhados
    ? {
        gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
        gridTemplateRows: `repeat(${mostrados.length}, ${altura ?? ALTURA_MINIMA}px)`,
      }
    : {
        ...(altura ? { height: altura } : {}),
        gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${linhas}, minmax(0, 1fr))`,
      };

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Painéis" ocultarComAbas />
      {paineis.isPending ? (
        <p role="status" className={estilos.nota}>
          Carregando os painéis…
        </p>
      ) : paineis.isError ? (
        <EstadoVazio
          titulo={paineis.error.message}
          acao={<Botao onPress={() => void paineis.refetch()}>Tentar de novo</Botao>}
        />
      ) : ativos.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum painel cadastrado."
          descricao={
            pode('paineis.administrar')
              ? 'Cadastre o endereço de cada painel das VMs, como http://10.0.0.20:3000, para vê-los lado a lado aqui.'
              : 'Quem administra os painéis cadastra os endereços dos painéis das VMs.'
          }
          acao={
            pode('paineis.administrar') ? (
              <Botao onPress={() => void navegar({ to: '/paineis/cadastro' })}>
                Abrir o cadastro
              </Botao>
            ) : undefined
          }
        />
      ) : (
        <div ref={grade} className={estilos.grade} style={forma}>
          {mostrados.map((painel) => (
            <BlocoDoPainel
              key={painel.id}
              painel={painel}
              expandido={painel.id === emFoco?.id}
              aoExpandir={(expandir_) => expandir(expandir_ ? painel.id : null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
