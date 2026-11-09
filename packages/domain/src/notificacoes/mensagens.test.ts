// As mensagens dos canais de fora (spec notificacoes, "E-mail do crítico na hora", "Resumo diário
// por e-mail", "Push por severidade" e "Teste dos canais"; change p3c-email-e-push, design,
// decisões 6 e 7): o e-mail em texto e o conteúdo do push.
import { describe, expect, it } from 'vitest';
import {
  conteudoDoPush,
  emailDeTeste,
  emailDoCritico,
  emailDoResumo,
  enderecoDoRegistro,
  ITENS_DO_RESUMO,
  type NotificacaoParaMensagem,
  pushDeTeste,
} from './mensagens.ts';

const ORGANIZACAO = { organizacao: 'Empresa de exemplo', origem: 'https://grafite.empresa.com.br' };

const notificacao = (dados: Partial<NotificacaoParaMensagem> = {}): NotificacaoParaMensagem => ({
  id: '0199d3a0-0000-7000-8000-0000000000e1',
  severidade: 'critico',
  titulo: 'Black Toner Cartridge em 8%',
  descricao: 'HP LaserJet M404 · PAT-00412',
  origem: 'Alertas',
  destino: '/ativos/0199d3a0-0000-7000-8000-0000000000a1',
  criadaEm: new Date('2026-10-14T13:05:00.000Z'),
  ...dados,
});

describe('endereço do registro', () => {
  it('junta a origem da organização ao destino, e sem destino leva à tela inicial', () => {
    expect(enderecoDoRegistro('https://grafite.empresa.com.br', '/ativos/1')).toBe(
      'https://grafite.empresa.com.br/ativos/1',
    );
    expect(enderecoDoRegistro('http://localhost:5173/', null)).toBe('http://localhost:5173/');
  });
});

describe('e-mail do crítico', () => {
  it('tem o assunto com a severidade, o texto da central e o endereço do registro', () => {
    const { assunto, texto } = emailDoCritico(notificacao(), ORGANIZACAO);
    expect(assunto).toBe('Crítico: Black Toner Cartridge em 8%');
    expect(texto).toContain('Black Toner Cartridge em 8%\nHP LaserJet M404 · PAT-00412\n');
    expect(texto).toContain('Origem: Alertas');
    expect(texto).toContain(
      'Abrir: https://grafite.empresa.com.br/ativos/0199d3a0-0000-7000-8000-0000000000a1',
    );
    expect(texto).toContain('Empresa de exemplo');
    expect(texto).toContain('Ajustes › Notificações');
  });

  it('sem descrição nem destino, não traz as linhas deles', () => {
    const { texto } = emailDoCritico(
      notificacao({ descricao: null, destino: null, titulo: '6 alertas abertos' }),
      ORGANIZACAO,
    );
    expect(texto.startsWith('6 alertas abertos\n\nOrigem: Alertas\n')).toBe(true);
    expect(texto).not.toContain('Abrir:');
  });
});

describe('resumo', () => {
  it('diz quantas não lidas há e lista cada uma com a severidade, a origem e o horário', () => {
    const { assunto, texto } = emailDoResumo(
      [
        notificacao({ severidade: 'atencao', titulo: 'Coletor sem contato', origem: 'Alertas' }),
        notificacao({
          severidade: 'info',
          titulo: 'Backup concluído',
          origem: 'Operação',
          criadaEm: new Date('2026-10-13T22:40:00.000Z'),
        }),
      ],
      2,
      { ...ORGANIZACAO, fuso: 'America/Sao_Paulo' },
    );
    expect(assunto).toBe('Resumo do Grafite: 2 notificações não lidas');
    expect(texto).toContain('Atenção · Coletor sem contato · Alertas · 14/10 10:05');
    expect(texto).toContain('Informação · Backup concluído · Operação · 13/10 19:40');
    expect(texto).toContain('Abrir o Grafite: https://grafite.empresa.com.br/');
    expect(texto).not.toContain('E mais');
  });

  it('com uma só, o assunto fica no singular', () => {
    expect(
      emailDoResumo([notificacao()], 1, { ...ORGANIZACAO, fuso: 'America/Sao_Paulo' }).assunto,
    ).toBe('Resumo do Grafite: 1 notificação não lida');
  });

  it('lista até 50 e diz quantas mais há na central', () => {
    const muitas = Array.from({ length: ITENS_DO_RESUMO }, (_, i) =>
      notificacao({ titulo: `Alerta ${i + 1}` }),
    );
    const { texto } = emailDoResumo(muitas, 73, { ...ORGANIZACAO, fuso: 'America/Sao_Paulo' });
    expect(ITENS_DO_RESUMO).toBe(50);
    expect(texto).toContain('Alerta 50');
    expect(texto).toContain('E mais 23 na central.');
  });
});

describe('e-mail de teste', () => {
  it('diz que é um teste e de qual organização', () => {
    const { assunto, texto } = emailDeTeste(ORGANIZACAO);
    expect(assunto).toBe('Teste do e-mail do Grafite');
    expect(texto).toContain('Empresa de exemplo');
  });
});

describe('push', () => {
  it('leva o título com a severidade, a descrição, o destino e a etiqueta da notificação', () => {
    expect(conteudoDoPush(notificacao())).toEqual({
      titulo: 'Crítico: Black Toner Cartridge em 8%',
      corpo: 'HP LaserJet M404 · PAT-00412',
      destino: '/ativos/0199d3a0-0000-7000-8000-0000000000a1',
      severidade: 'critico',
      etiqueta: '0199d3a0-0000-7000-8000-0000000000e1',
    });
  });

  it('sem descrição, o corpo é a origem; sem destino, abre a tela inicial', () => {
    const conteudo = conteudoDoPush(notificacao({ descricao: null, destino: null }));
    expect(conteudo.corpo).toBe('Alertas');
    expect(conteudo.destino).toBe('/');
  });

  it('o aviso de teste leva à seção Notificações dos Ajustes', () => {
    expect(pushDeTeste()).toMatchObject({
      titulo: 'Teste do aviso do Grafite',
      destino: '/ajustes/notificacoes',
      severidade: 'info',
    });
  });
});
