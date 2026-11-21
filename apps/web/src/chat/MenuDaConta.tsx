// O menu da conta no pé da trilha (spec modulo-chat, "App do chat"): a foto ou as iniciais abrem o
// tema, que vale na hora e é gravado na conta, como nos Ajustes, e "Sair". Quem só usa o chat
// nunca chega aos Ajustes, e o tema é o que muda de um aparelho para outro. Na barra de baixo do
// celular, a foto vai com "Conta" embaixo, como as vistas, e o menu abre acima dela. Para quem
// configura o chat, "Equipes e canais" abre a tela no Grafite, numa janela nova, porque a conta que
// entra no app pode não ter outro caminho até ela (change chat-com-chamados, design, decisão 15).
import { TEMAS_DA_ESCOLHA } from '@grafite/domain';
import {
  Avatar,
  avisar,
  Botao,
  type IdDoTema,
  ItemDeMenu,
  Menu,
  SecaoDeMenu,
  Separador,
  Submenu,
  temas,
} from '@grafite/ui';
import { miniaturasDaConta } from '../api/fotos.ts';
import { usePreferencias } from '../preferencias/usePreferencias.tsx';
import type { ContaDaSessao } from '../sessao/loja.ts';
import { pagina } from '../sessao/pagina.ts';
import { useAcesso } from '../sessao/useAcesso.ts';
import { useLojaDaSessao } from '../sessao/useSessao.tsx';
import { useIrNoChat } from './base.tsx';
import estilos from './MolduraDoChat.module.css';

const IDS_DOS_TEMAS = Object.keys(temas) as IdDoTema[];

/** Os temas como nos Ajustes: os escuros, os claros e o montado pela conta. */
const GRUPOS_DE_TEMAS = [
  { nome: 'Escuros', temas: IDS_DOS_TEMAS.filter((id) => temas[id].tom === 'escuro') },
  { nome: 'Claros', temas: IDS_DOS_TEMAS.filter((id) => temas[id].tom === 'claro') },
];

export function MenuDaConta({
  conta,
  naBarraDeBaixo = false,
}: {
  conta: ContaDaSessao;
  naBarraDeBaixo?: boolean;
}) {
  const loja = useLojaDaSessao();
  const { pode } = useAcesso();
  const irNoChat = useIrNoChat();
  const { preferencias, mudar } = usePreferencias();
  const tema = preferencias.aparencia.tema;
  /** Sair encerra a sessão e recarrega a página, que recomeça sem nada da conta na memória. */
  const sair = async () => {
    const resultado = await loja.sair();
    if ('erro' in resultado) avisar({ situacao: 'atencao', titulo: resultado.erro });
    else pagina.recarregar();
  };
  const escolher = (chaves: 'all' | Set<string | number>) => {
    if (chaves === 'all') return;
    const escolhido = TEMAS_DA_ESCOLHA.find((id) => chaves.has(id));
    if (escolhido && escolhido !== tema) mudar('aparencia', { tema: escolhido });
  };
  const secao = (titulo: string, ids: readonly (typeof TEMAS_DA_ESCOLHA)[number][]) => (
    <SecaoDeMenu
      key={titulo}
      titulo={titulo}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[tema]}
      onSelectionChange={escolher}
    >
      {ids.map((id) => (
        <ItemDeMenu key={id} id={id}>
          {id === 'personalizado' ? 'Personalizado' : temas[id].nome}
        </ItemDeMenu>
      ))}
    </SecaoDeMenu>
  );
  return (
    <Menu
      rotulo={conta.nome}
      posicao={naBarraDeBaixo ? 'top end' : 'end bottom'}
      gatilho={
        naBarraDeBaixo ? (
          <Botao nivel="terciario" className={`${estilos.conta} ${estilos.contaNaBarra}`}>
            <Avatar
              nome={conta.nome}
              imagens={miniaturasDaConta(conta.foto)}
              className={estilos.fotoDaConta}
              decorativo
            />
            Conta
          </Botao>
        ) : (
          <Botao nivel="terciario" aria-label={conta.nome} className={estilos.conta}>
            <Avatar nome={conta.nome} imagens={miniaturasDaConta(conta.foto)} decorativo />
          </Botao>
        )
      }
    >
      <Submenu rotulo="Tema">
        {GRUPOS_DE_TEMAS.map((grupo) => secao(grupo.nome, grupo.temas))}
        {secao('Montado por você', ['personalizado'])}
      </Submenu>
      {pode('chat.configurar') ? (
        <ItemDeMenu
          descricao="No Grafite, numa janela nova"
          onAction={() => irNoChat('/conversas/equipes-e-canais')}
        >
          Equipes e canais
        </ItemDeMenu>
      ) : null}
      <Separador />
      <ItemDeMenu onAction={() => void sair()}>Sair</ItemDeMenu>
    </Menu>
  );
}
