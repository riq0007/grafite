import { describe, expect, it } from 'vitest';
import documento from '../../../../docs/casca/modulos.md?raw';

/** Os arquivos do contrato de módulo que o documento pode reproduzir, inteiros ou em trechos. */
const arquivos = import.meta.glob<string>(
  [
    './registro.ts',
    './registroDaConta.ts',
    './tipos.ts',
    './administracao/SemPermissao.tsx',
    './administracao/Secao.tsx',
    './administracao/pessoas/FichaDaPessoa.tsx',
    './administracao/pessoas/FotoDaPessoa.tsx',
    './administracao/pessoas/Pessoas.tsx',
    './administracao/tarefas/Tarefas.tsx',
    './ativos/disponibilidade.tsx',
    './ativos/menu.ts',
    './ativos/suprimentos.tsx',
    './ativos/control-id.tsx',
    './ativos/cadastro/CampoDoAtivo.tsx',
    './alertas/ocorrencias.ts',
    './alertas/resumo.ts',
    './indicadores/MudarAMeta.tsx',
    './ativos/tabela/celulas.tsx',
    './*/modulo.ts',
    './*/busca.ts',
    './*/rotas.tsx',
    './*/secoes.ts',
    './*/secoes/*.tsx',
    '../busca/acoesDaTela.tsx',
    '../busca/tipos.ts',
    '../notificacoes/useNotificacoes.tsx',
    '../notificacoes/etapa.ts',
    '../chegada/etapas.ts',
    '../chegada/prazo.ts',
    '../chegada/chegar.tsx',
    '../sessao/loja.ts',
    '../sessao/useSessao.tsx',
    '../sessao/useAcesso.ts',
    '../sessao/etapa.ts',
    '../api/cliente.ts',
    '../api/useApi.tsx',
    '../api/pedir.ts',
    '../api/consultas.ts',
    '../api/fotos.ts',
    '../eventos/canal.ts',
    '../casca/status/useAgora.ts',
    '../casca/abasDoApp.tsx',
    '../preferencias/usePreferencias.tsx',
    '../preferencias/alvo.tsx',
    '../main.tsx',
    '../pwa/versaoNova.ts',
    '../../../../packages/ui/src/componentes/tabela/Tabela.stories.tsx',
    '../../../../packages/ui/src/componentes/tabela/TabelaComPrevia.stories.tsx',
    '../../../../packages/ui/src/componentes/escolhas/ControleSegmentado.tsx',
    '../../../../packages/ui/src/componentes/indicador/Indicador.tsx',
    '../../../../packages/ui/src/componentes/aviso/avisos.ts',
    '../../../../packages/ui/src/componentes/avatar/Avatar.tsx',
    '../../../../packages/ui/src/inicio/ocorrencias.ts',
    '../../../../packages/ui/src/regiao/dataHora.ts',
    '../../../../packages/domain/src/acesso/permissoes.ts',
    '../../../../packages/domain/src/acesso/acesso.ts',
    '../../../../packages/domain/src/eventos/eventos.ts',
    '../../../../packages/domain/src/modulos/modulos.ts',
    '../../../../packages/domain/src/notificacoes/notificacoes.ts',
    '../../../../apps/api/src/notificacoes/notificar.ts',
    '../../../../apps/api/src/acesso/escopo.ts',
    '../../../../apps/api/src/app.ts',
    '../../../../apps/api/src/rotas/pessoas.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);

const PASTA = 'apps/web/src/modulos/';

/** Os mesmos arquivos, pelo caminho a partir da raiz do repositório, como o documento os escreve. */
const fontes = new Map(
  Object.entries(arquivos).map(([relativo, codigo]) => [
    new URL(relativo, `file:///${PASTA}`).pathname.slice(1),
    codigo,
  ]),
);

/**
 * Blocos de código do documento cuja primeira linha é o caminho do arquivo que reproduzem. Com
 * "(trecho)" depois do caminho, o bloco é uma parte do arquivo, sem cortes no meio.
 */
const blocos = [...documento.matchAll(/```tsx?\n\/\/ (\S+)( \(trecho\))?\n([\s\S]*?)```/g)].map(
  ([, caminho = '', trecho, codigo = '']) => ({ caminho, trecho: trecho !== undefined, codigo }),
);

describe('docs/casca/modulos.md', () => {
  it('traz Início e Ajustes de exemplo, com o registro', () => {
    expect(blocos.map((bloco) => bloco.caminho)).toEqual(
      expect.arrayContaining([
        `${PASTA}inicio/modulo.ts`,
        `${PASTA}inicio/rotas.tsx`,
        `${PASTA}ajustes/modulo.ts`,
        `${PASTA}ajustes/rotas.tsx`,
        `${PASTA}registro.ts`,
      ]),
    );
  });

  it('traz, do código, a fonte de ocorrências de verdade, a dos alertas', () => {
    const doArquivo = blocos
      .filter((bloco) => bloco.caminho === `${PASTA}alertas/ocorrencias.ts` && bloco.trecho)
      .map((bloco) => bloco.codigo)
      .join('');
    expect(doArquivo).toContain(
      "assinar: (aoMudar, { canal }) => canal.ouvir('alertas.mudaram', aoMudar)",
    );
  });

  it('traz, do código, a busca, as notificações, a prévia na tabela e o cursor', () => {
    expect(blocos.filter((bloco) => bloco.trecho).map((bloco) => bloco.caminho)).toEqual(
      expect.arrayContaining([
        `${PASTA}tipos.ts`,
        'apps/web/src/busca/tipos.ts',
        `${PASTA}ajustes/secoes/Dock.tsx`,
        'apps/api/src/notificacoes/notificar.ts',
        'packages/ui/src/componentes/tabela/Tabela.stories.tsx',
        'packages/ui/src/componentes/escolhas/ControleSegmentado.tsx',
      ]),
    );
  });

  it('traz, de uma história do catálogo, a tabela com a seleção e a prévia paginada', () => {
    const doArquivo = blocos
      .filter(
        (bloco) =>
          bloco.caminho === 'packages/ui/src/componentes/tabela/TabelaComPrevia.stories.tsx' &&
          bloco.trecho,
      )
      .map((bloco) => bloco.codigo)
      .join('');
    expect(doArquivo).toContain(
      'usePrevia(lista, (item) => item.id, { total: TOTAL, carregarMais, selecao })',
    );
    expect(doArquivo).toContain('aoMudarSelecao={definirSelecao}');
  });

  it('traz, do código, as ocorrências, as datas no fuso, o aviso com ação e as etapas da chegada', () => {
    const trechos = blocos.filter((bloco) => bloco.trecho);
    const doArquivo = (caminho: string) =>
      trechos.filter((bloco) => bloco.caminho === caminho).map((bloco) => bloco.codigo);
    expect(doArquivo(`${PASTA}tipos.ts`).join('')).toContain('interface FonteDeOcorrencias');
    expect(doArquivo('packages/ui/src/inicio/ocorrencias.ts').join('')).toContain(
      'interface OcorrenciaAberta',
    );
    expect(doArquivo('packages/ui/src/regiao/dataHora.ts').join('')).toContain(
      'interface DataHora',
    );
    expect(doArquivo('packages/ui/src/componentes/aviso/avisos.ts').join('')).toContain(
      'persistente?: boolean',
    );
    expect(doArquivo('apps/web/src/pwa/versaoNova.ts').join('')).toContain("rotulo: 'Atualizar'");
    expect(doArquivo('apps/web/src/chegada/etapas.ts').join('')).toContain(
      'interface EtapaDaChegada',
    );
    expect(doArquivo('apps/web/src/chegada/chegar.tsx').join('')).toContain('etapas?:');
  });

  it('traz, do código, o relógio da idade e a célula de um valor coletado', () => {
    const doArquivo = (caminho: string) =>
      blocos
        .filter((bloco) => bloco.caminho === caminho)
        .map((bloco) => bloco.codigo)
        .join('');
    expect(doArquivo('apps/web/src/casca/status/useAgora.ts')).toContain(
      'export function useAgora(): Date',
    );
    expect(doArquivo(`${PASTA}ativos/disponibilidade.tsx`)).toContain(
      'export function DisponibilidadeNaCelula',
    );
  });

  it('traz, do código, a sessão, o cliente da API, o 401 e as etapas da sessão e dos alertas', () => {
    const doArquivo = (caminho: string) =>
      blocos
        .filter((bloco) => bloco.caminho === caminho)
        .map((bloco) => bloco.codigo)
        .join('');
    expect(doArquivo('apps/web/src/sessao/loja.ts')).toContain('export type EstadoDaSessao');
    expect(doArquivo('apps/web/src/sessao/useSessao.tsx')).toContain(
      'export function useSessao(): EstadoDaSessao',
    );
    expect(doArquivo('apps/web/src/api/useApi.tsx')).toContain(
      'export function useApi(): ClienteDaApi',
    );
    expect(doArquivo('apps/web/src/api/cliente.ts')).toContain("'x-grafite-csrf'");
    expect(doArquivo('apps/web/src/api/cliente.ts')).toContain('aoPerderASessao()');
    expect(doArquivo('apps/web/src/api/pedir.ts')).toContain('export async function pedir');
    expect(blocos).toContainEqual(
      expect.objectContaining({ caminho: 'apps/web/src/sessao/etapa.ts', trecho: false }),
    );
    expect(blocos).toContainEqual(
      expect.objectContaining({ caminho: 'apps/web/src/notificacoes/etapa.ts', trecho: false }),
    );
    expect(doArquivo('apps/web/src/chegada/prazo.ts')).toContain('interface PrazoDoServidor');
    expect(doArquivo('apps/web/src/main.tsx')).toContain('etapaDaSessao(sessao, prazo),');
    expect(doArquivo('apps/web/src/main.tsx')).toContain(
      'etapaDosAlertas({ loja: sessao, consultas, conexao, prazo }),',
    );
    // As etapas da sessão e dos alertas deixaram de ser ilustrativas.
    expect(documento).not.toContain('sessao.validada');
    expect(documento).not.toContain('alertas.conectados');
  });

  it('traz, do código, as permissões, o acesso na tela e na API, as consultas e a tela sem permissão', () => {
    const doArquivo = (caminho: string) =>
      blocos
        .filter((bloco) => bloco.caminho === caminho)
        .map((bloco) => bloco.codigo)
        .join('');
    expect(doArquivo('packages/domain/src/acesso/permissoes.ts')).toContain(
      'export interface DefinicaoDePermissao',
    );
    expect(doArquivo(`${PASTA}tipos.ts`)).toContain('export interface ExigePermissoes');
    expect(doArquivo(`${PASTA}registroDaConta.ts`)).toContain('export function registroDaConta');
    expect(doArquivo('apps/web/src/sessao/useAcesso.ts')).toContain(
      'export function useAcesso(): Acesso',
    );
    expect(doArquivo(`${PASTA}administracao/SemPermissao.tsx`)).toContain(
      'export function SemPermissao',
    );
    expect(doArquivo('apps/api/src/acesso/escopo.ts')).toContain('export function exigirEm');
    expect(doArquivo('packages/domain/src/acesso/acesso.ts')).toContain('export function alcance');
    expect(doArquivo('apps/web/src/api/consultas.ts')).toContain('export async function consultar');
    expect(doArquivo('apps/web/src/api/consultas.ts')).toContain('export function paginar');
  });

  it('traz, do código, os eventos no registro, as preferências do servidor, o alvo das seções e a foto', () => {
    const doArquivo = (caminho: string) =>
      blocos
        .filter((bloco) => bloco.caminho === caminho)
        .map((bloco) => bloco.codigo)
        .join('');
    expect(doArquivo('apps/web/src/eventos/canal.ts')).toContain('export interface EventoRecebido');
    expect(doArquivo('packages/domain/src/eventos/eventos.ts')).toContain(
      'export const TIPOS_DE_EVENTO',
    );
    expect(doArquivo(`${PASTA}tipos.ts`)).toContain('export type EventosDoModulo');
    expect(doArquivo(`${PASTA}administracao/tarefas/Tarefas.tsx`)).toContain(
      'export const CHAVE_DAS_TAREFAS',
    );
    expect(doArquivo('apps/web/src/preferencias/usePreferencias.tsx')).toContain(
      'export interface ControleDasPreferencias',
    );
    expect(doArquivo('apps/web/src/preferencias/alvo.tsx')).toContain(
      'export interface AlvoDasPreferencias',
    );
    expect(doArquivo(`${PASTA}ajustes/secoes/Dock.tsx`)).toContain('useAlvoDasPreferencias()');
    expect(doArquivo('apps/web/src/api/fotos.ts')).toContain('export const miniaturasDaPessoa');
    expect(doArquivo('packages/ui/src/componentes/avatar/Avatar.tsx')).toContain(
      'export type TamanhoDoAvatar',
    );
    expect(doArquivo(`${PASTA}administracao/pessoas/Pessoas.tsx`)).toContain(
      'imagens={miniaturasDaPessoa(pessoa.id, pessoa.foto)}',
    );
    expect(doArquivo(`${PASTA}administracao/pessoas/FotoDaPessoa.tsx`)).toContain(
      'api.enviarArquivo',
    );
    // O que o F2c entregou deixou de ficar fora do contrato, e ligar módulos foi para o P1.
    expect(documento).not.toContain('Fuso guardado no servidor');
    expect(documento).not.toContain('entra no F2, como um filtro sobre o registro');
  });

  it('traz, do código, o menu em árvore com o submenu do catálogo, na Gestão de ativos', () => {
    const daGestao = blocos.filter(
      (bloco) => bloco.caminho === `${PASTA}gestao/modulo.ts` && bloco.trecho,
    );
    expect(daGestao.map((bloco) => bloco.codigo).join('')).toContain("rotulo: 'Catálogo',");
    expect(daGestao.map((bloco) => bloco.codigo).join('')).toContain('filhos: SECOES_DO_CATALOGO');
  });

  it('traz, do código, os itens de menu dos dados e o menu do Ativos com eles', () => {
    const doArquivo = (caminho: string) =>
      blocos
        .filter((bloco) => bloco.caminho === caminho && bloco.trecho)
        .map((bloco) => bloco.codigo)
        .join('');
    expect(doArquivo(`${PASTA}tipos.ts`)).toContain('export interface MenuDinamicoDoModulo');
    expect(doArquivo(`${PASTA}ativos/menu.ts`)).toContain('export const MENU_DINAMICO_DOS_ATIVOS');
    expect(documento).toContain('### Itens de menu dos dados');
  });

  it('traz, do código, a coluna de situação de outra capacidade, como o Control iD', () => {
    const doArquivo = blocos
      .filter((bloco) => bloco.caminho === `${PASTA}ativos/control-id.tsx` && bloco.trecho)
      .map((bloco) => bloco.codigo)
      .join('');
    expect(doArquivo).toContain('export function ControlIdNaCelula');
    expect(documento).toContain('### Coluna de situação de outra capacidade');
  });

  it('traz, do código, o valor coletado de vários itens, como os suprimentos', () => {
    const doArquivo = blocos
      .filter((bloco) => bloco.caminho === `${PASTA}ativos/suprimentos.tsx` && bloco.trecho)
      .map((bloco) => bloco.codigo)
      .join('');
    expect(doArquivo).toContain('export function SuprimentosNaCelula');
    expect(documento).toContain('### Vários itens');
    expect(documento).toContain('desatualizada(momento, agora, metrica)');
  });

  it('traz, do código, o módulo opcional: os opcionais, o registro sem os desligados e a guarda na API', () => {
    const doArquivo = (caminho: string) =>
      blocos
        .filter((bloco) => bloco.caminho === caminho)
        .map((bloco) => bloco.codigo)
        .join('');
    expect(doArquivo('packages/domain/src/modulos/modulos.ts')).toContain(
      'export const MODULOS_OPCIONAIS',
    );
    expect(doArquivo(`${PASTA}registroDaConta.ts`)).toContain('desligados: readonly string[] = []');
    expect(doArquivo('apps/api/src/app.ts')).toContain(
      "exigirModuloLigado(doAtivos, { banco, modulo: 'ativos' });",
    );
    expect(documento).toContain('## Módulo opcional');
    // Ligar e desligar módulos deixou de ficar fora do contrato.
    expect(documento).not.toContain('**Ligar e desligar módulos por organização:**');
  });

  it('reproduz cada exemplo exatamente como está no código', () => {
    for (const { caminho, trecho, codigo } of blocos) {
      const fonte = fontes.get(caminho);
      expect(fonte, `${caminho} não existe ou não é do contrato de módulo`).toBeDefined();
      if (trecho) expect(fonte, `${caminho} (trecho)`).toContain(codigo);
      else expect(codigo, caminho).toBe(fonte);
    }
  });
});
