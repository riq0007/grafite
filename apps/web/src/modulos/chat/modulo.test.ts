// O módulo Chat na casca (spec modulo-chat, "Chat na casca"; change chat-com-chamados, design,
// decisão 12): depois do Chamados no dock e no celular, para quem usa o chat, com o menu, o selo do
// total do chat mais os chamados com resposta nova e o app próprio em /chat; e para quem só configura
// o chat, com as Equipes e canais no menu.
import { fechamento, type Permissao } from '@grafite/domain';
import { ordenarParaOCelular } from '@grafite/ui';
import { describe, expect, it } from 'vitest';
import { modulosDaCasca } from '../../casca/modulosDaCasca.ts';
import { REGISTRO } from '../registro.ts';
import { itensPermitidos, registroDaConta } from '../registroDaConta.ts';
import { chat, seloDoChat } from './modulo.ts';

/** As permissões dadas e as que elas incluem, como no acesso da sessão. */
const com = (...permissoes: Permissao[]) => {
  const todas = fechamento(permissoes);
  return (chave: Permissao) => todas.has(chave);
};

const resumo = (naoLidas: number, chamadosComRespostaNova: number | null) => ({
  naoLidas,
  chamadosComRespostaNova,
});

describe('o módulo Chat', () => {
  it('vem logo depois do Chamados no dock', () => {
    const ids = REGISTRO.map((modulo) => modulo.id);
    expect(ids.indexOf('chat')).toBe(ids.indexOf('chamados') + 1);
  });

  it('fica na barra de abas do celular depois do Chamados, antes do Início', () => {
    const { modulos } = modulosDaCasca(registroDaConta(REGISTRO, () => true));
    const ordem = ordenarParaOCelular(modulos).map((modulo) => modulo.id);
    expect(ordem.slice(0, 3)).toEqual(['chamados', 'chat', 'inicio']);
  });

  it('aparece para quem usa o chat, e não para quem só pede chamados', () => {
    const ids = (pode: (chave: Permissao) => boolean) =>
      registroDaConta(REGISTRO, pode).map((modulo) => modulo.id);
    expect(ids(com('chat.usar'))).toContain('chat');
    expect(ids(com('chamados.pedir'))).not.toContain('chat');
  });

  it('o menu tem Chat, Equipes e Chamados, e Chamados some com o módulo desligado', () => {
    const rotulos = (desligados: readonly string[]) =>
      itensPermitidos(chat.menu ?? [], com('chat.usar'), desligados).map((item) => item.rotulo);
    expect(rotulos([])).toEqual(['Chat', 'Equipes', 'Chamados']);
    expect(rotulos(['chamados'])).toEqual(['Chat', 'Equipes']);
  });

  it('aparece para quem só configura o chat, com só "Equipes e canais" no menu, sem a linha antes', () => {
    expect(registroDaConta(REGISTRO, com('chat.configurar')).map(({ id }) => id)).toContain('chat');
    expect(itensPermitidos(chat.menu ?? [], com('chat.configurar'))).toEqual([
      {
        rotulo: 'Equipes e canais',
        destino: '/conversas/equipes-e-canais',
        permissoes: ['chat.configurar'],
      },
    ]);
  });

  it('quem usa e configura o chat tem "Equipes e canais" no fim do menu, separado das vistas', () => {
    const itens = itensPermitidos(chat.menu ?? [], com('chat.usar', 'chat.configurar'));
    expect(itens.map((item) => item.rotulo)).toEqual([
      'Chat',
      'Equipes',
      'Chamados',
      'Equipes e canais',
    ]);
    expect(itens.at(-1)?.separadoAntes).toBe(true);
  });

  it('o app próprio é o /chat, para quem usa o chat', () => {
    expect(chat.appProprio).toEqual({ endereco: '/chat', permissoes: ['chat.usar'] });
  });
});

describe('o selo do Chat', () => {
  it('mostra o total do chat, como as 2 não lidas de Ana Souza', () => {
    expect(seloDoChat(resumo(2, 0))).toEqual({ texto: '2', descricao: '2 não lidas' });
  });

  it('soma os chamados com resposta nova ao total, e o leitor de tela ouve os dois', () => {
    expect(seloDoChat(resumo(2, 1))).toEqual({
      texto: '3',
      descricao: '2 não lidas, 1 chamado com resposta nova',
    });
    expect(seloDoChat(resumo(0, 2))).toEqual({
      texto: '2',
      descricao: '2 chamados com resposta nova',
    });
  });

  it('com o Chamados desligado, conta só o total do chat', () => {
    expect(seloDoChat(resumo(1, null))).toEqual({ texto: '1', descricao: '1 não lida' });
  });

  it('acima de 99, mostra 99+', () => {
    expect(seloDoChat(resumo(100, 0))).toEqual({ texto: '99+', descricao: 'mais de 99 não lidas' });
    expect(seloDoChat(resumo(99, 1))?.texto).toBe('99+');
  });

  it('sem nada novo, ou enquanto o resumo carrega, fica sem selo', () => {
    expect(seloDoChat(resumo(0, 0))).toBeNull();
    expect(seloDoChat(resumo(0, null))).toBeNull();
    expect(seloDoChat(undefined)).toBeNull();
  });
});
