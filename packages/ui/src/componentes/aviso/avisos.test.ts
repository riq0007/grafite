import { describe, expect, it } from 'vitest';
import { avisar, criarFilaDeAvisos } from './avisos.ts';

const titulos = (fila: ReturnType<typeof criarFilaDeAvisos>) =>
  fila.naTela.map(({ aviso }) => aviso.titulo);

describe('fila de avisos', () => {
  it('o aviso que não é crítico some em 6 s; o crítico fica até alguém agir', () => {
    const fila = criarFilaDeAvisos();
    avisar({ situacao: 'atencao', titulo: 'Toner baixo na HP M404' }, fila);
    avisar({ situacao: 'critico', titulo: 'Switch do CPD sem resposta' }, fila);
    const porTitulo = (titulo: string) => fila.naTela.find(({ aviso }) => aviso.titulo === titulo);
    expect(porTitulo('Toner baixo na HP M404')?.duracao).toBe(6000);
    expect(porTitulo('Switch do CPD sem resposta')).toBeDefined();
    expect(porTitulo('Switch do CPD sem resposta')?.duracao).toBeUndefined();
  });

  it('com três na tela, o que chega tira o temporário mais antigo, e a região desenha só os da tela', () => {
    const fila = criarFilaDeAvisos();
    for (let i = 1; i <= 5; i++) avisar({ situacao: 'info', titulo: `Aviso ${i}` }, fila);
    expect(titulos(fila)).toEqual(['Aviso 5', 'Aviso 4', 'Aviso 3']);
    expect(fila.esperando).toHaveLength(0);
    expect(fila.doReactAria.visibleToasts.map((aviso) => aviso.content.titulo)).toEqual([
      'Aviso 5',
      'Aviso 4',
      'Aviso 3',
    ]);
  });

  it('com três críticos na tela, o aviso que chega espera fora da região e entra quando um sai', () => {
    const fila = criarFilaDeAvisos();
    const criticos = [1, 2, 3].map((i) =>
      avisar({ situacao: 'critico', titulo: `Crítico ${i}` }, fila),
    );
    avisar({ situacao: 'atencao', titulo: 'Toner baixo' }, fila);
    expect(titulos(fila)).toEqual(['Crítico 3', 'Crítico 2', 'Crítico 1']);
    expect(fila.doReactAria.visibleToasts).toHaveLength(3);
    fila.fechar(criticos[1] as string);
    expect(titulos(fila)).toEqual(['Toner baixo', 'Crítico 3', 'Crítico 1']);
    expect(fila.doReactAria.visibleToasts.map((aviso) => aviso.content.titulo)).toEqual([
      'Toner baixo',
      'Crítico 3',
      'Crítico 1',
    ]);
  });

  it('um aviso fechado pela própria região (tempo ou botão) sai da fila e dá a vez ao próximo', () => {
    const fila = criarFilaDeAvisos();
    for (let i = 1; i <= 3; i++) avisar({ situacao: 'critico', titulo: `Crítico ${i}` }, fila);
    avisar({ situacao: 'info', titulo: 'Sincronização concluída' }, fila);
    const primeiro = fila.doReactAria.visibleToasts.at(-1);
    fila.doReactAria.close(primeiro?.key ?? '');
    expect(titulos(fila)).toEqual(['Sincronização concluída', 'Crítico 3', 'Crítico 2']);
  });

  it('o persistente de Informação fica sem tempo, qualquer que seja o escolhido', () => {
    const fila = criarFilaDeAvisos({ duracaoDoTemporario: 20000 });
    avisar({ situacao: 'info', titulo: 'Nova versão do Grafite', persistente: true }, fila);
    avisar({ situacao: 'info', titulo: 'Sincronização concluída' }, fila);
    expect(fila.naTela.map(({ aviso, duracao }) => [aviso.titulo, duracao])).toEqual([
      ['Sincronização concluída', 20000],
      ['Nova versão do Grafite', undefined],
    ]);
    expect(fila.doReactAria.visibleToasts.map((aviso) => aviso.timeout)).toEqual([
      20000,
      undefined,
    ]);
  });

  it('um persistente não sai da tela por causa de outro aviso: sai o temporário mais antigo', () => {
    const fila = criarFilaDeAvisos();
    avisar({ situacao: 'info', titulo: 'Nova versão do Grafite', persistente: true }, fila);
    for (let i = 1; i <= 4; i++) avisar({ situacao: 'info', titulo: `Aviso ${i}` }, fila);
    expect(titulos(fila)).toEqual(['Aviso 4', 'Aviso 3', 'Nova versão do Grafite']);
  });

  it('a ação com nome próprio chega à região junto com o aviso', () => {
    const fila = criarFilaDeAvisos();
    const aoEscolher = () => {};
    avisar(
      {
        situacao: 'info',
        titulo: 'Nova versão do Grafite',
        persistente: true,
        acao: { rotulo: 'Atualizar', aoEscolher },
      },
      fila,
    );
    expect(fila.doReactAria.visibleToasts[0]?.content.acao).toEqual({
      rotulo: 'Atualizar',
      aoEscolher,
    });
  });

  it('um aviso com tempo próprio, como o de exemplo, fica na tela esse tempo', () => {
    const fila = criarFilaDeAvisos({ duracaoDoTemporario: 6000 });
    avisar({ situacao: 'info', titulo: 'Aviso de exemplo', duracao: 20_000 }, fila);
    avisar({ situacao: 'critico', titulo: 'Switch do CPD sem resposta', duracao: 20_000 }, fila);
    const porTitulo = (titulo: string) => fila.naTela.find(({ aviso }) => aviso.titulo === titulo);
    expect(porTitulo('Aviso de exemplo')?.duracao).toBe(20_000);
    // O crítico continua sem tempo, até alguém agir.
    expect(porTitulo('Switch do CPD sem resposta')?.duracao).toBeUndefined();
  });

  it('a duração do temporário vale para os avisos que chegam depois da troca', () => {
    const fila = criarFilaDeAvisos({ duracaoDoTemporario: 800 });
    avisar({ situacao: 'sucesso', titulo: 'Ativo salvo' }, fila);
    fila.duracaoDoTemporario = 20000;
    avisar({ situacao: 'info', titulo: 'Sincronização concluída' }, fila);
    expect(fila.naTela.map(({ duracao }) => duracao)).toEqual([20000, 800]);
  });
});
