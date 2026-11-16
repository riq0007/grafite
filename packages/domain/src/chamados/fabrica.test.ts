import { describe, expect, it } from 'vitest';
import { TIPOS_DE_CHAMADO_DE_FABRICA, type TipoDeChamadoDeFabrica } from './fabrica.ts';
import {
  type CampoDoFormulario,
  conferirFormulario,
  ID_DO_FORMULARIO,
  ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO,
} from './formulario.ts';
import { fraseDoPrazo, HORARIO_DA_TI_PADRAO } from './prazo.ts';
import { conferirTipoDeChamado } from './tipo.ts';
import {
  type ContextoDasRespostas,
  nomeNoResumo,
  resumoDasRespostas,
  tituloDasRespostas,
} from './titulo-e-resumo.ts';

const doTipo = (nome: string): TipoDeChamadoDeFabrica => {
  const tipo = TIPOS_DE_CHAMADO_DE_FABRICA.find((outro) => outro.nome === nome);
  if (!tipo) throw new Error(`Sem o tipo ${nome}.`);
  return tipo;
};

/**
 * O campo numa linha, no molde da tabela do design: o rótulo, o tipo, se é obrigatório, se só a TI
 * vê, a opção de que depende e as opções.
 */
function descrever(campo: CampoDoFormulario, campos: readonly CampoDoFormulario[]): string {
  const partes = [campo.rotulo, ROTULOS_DOS_TIPOS_DE_CAMPO_DO_CHAMADO[campo.tipo]];
  if (campo.obrigatorio) partes.push('obrigatório');
  if (campo.soDaTi) partes.push('só a TI vê');
  for (const clausula of campo.condicao) {
    const base = campos.find((outro) => outro.id === clausula.campoId);
    const opcao =
      'opcaoId' in clausula
        ? base?.opcoes.find((outra) => outra.id === clausula.opcaoId)?.texto
        : String(clausula.valor);
    partes.push(`só com ${opcao}`);
  }
  if (campo.opcoes.length > 0) partes.push(campo.opcoes.map((opcao) => opcao.texto).join(', '));
  return partes.join(' · ');
}

const formularios = () =>
  Object.fromEntries(
    TIPOS_DE_CHAMADO_DE_FABRICA.map(({ nome, formulario }) => [
      nome,
      formulario.campos.map((campo) => descrever(campo, formulario.campos)),
    ]),
  );

/** O ativo e o local das respostas de exemplo. */
const CONTEXTO: Omit<ContextoDasRespostas, 'nomeDoTipo'> = {
  ativos: new Map([
    ['ativo-impressora', { patrimonio: 'PAT-00139', rotulo: 'HP LaserJet 4003' }],
    ['ativo-notebook', { patrimonio: 'NB-0231', rotulo: 'Dell Latitude 5440' }],
  ]),
  locais: new Map([['local-jundiai', 'Jundiaí · Bloco B']]),
};

const titulo = (nome: string, respostas: Record<string, unknown>) =>
  tituloDasRespostas(doTipo(nome).formulario, respostas, { ...CONTEXTO, nomeDoTipo: nome });

describe('TIPOS_DE_CHAMADO_DE_FABRICA', () => {
  it('tem os 9 tipos da spec, nesta ordem, com o ícone, a frase e o prazo', () => {
    expect(
      TIPOS_DE_CHAMADO_DE_FABRICA.map(({ nome, icone, frase, prazo }) => [
        nome,
        icone,
        frase,
        fraseDoPrazo(prazo),
      ]),
    ).toEqual([
      [
        'Toner',
        'gota',
        'A impressora está sem toner ou a cópia saiu fraca',
        'Responde em 30 min e resolve em 8 h, em horas corridas',
      ],
      [
        'Computador',
        'notebook',
        'Não liga, está lento ou travando',
        'Responde em 30 min e resolve em 5 h, em horas corridas',
      ],
      [
        'Impressora',
        'impressora',
        'Mancha, atola ou não imprime',
        'Responde em 30 min e resolve em 8 h, no horário da TI',
      ],
      [
        'Acesso e senha',
        'cadeado',
        'Esqueci a senha ou preciso entrar numa pasta',
        'Responde em 30 min e resolve em 4 h, no horário da TI',
      ],
      [
        'Software',
        'janela',
        'Instalar um programa ou ele dá erro',
        'Responde em 1 h e resolve em 24 h, em horas corridas',
      ],
      [
        'Rede e internet',
        'globo',
        'Sem internet, lenta ou o Wi-Fi não conecta',
        'Responde em 30 min e resolve em 8 h, em horas corridas',
      ],
      [
        'Telefone',
        'telefone',
        'Ramal sem tom, chiado ou celular da empresa',
        'Responde em 1 h e resolve em 10 h, em horas corridas',
      ],
      [
        'Outro',
        'reticencias',
        'Não achou o seu caso? Conte com as suas palavras',
        'Responde em 1 h e resolve em 24 h, em horas corridas',
      ],
      [
        'Troca de equipamento',
        'setas',
        'Trocar um equipamento por outro',
        'Responde em 1 h e resolve em 3 dias úteis, no horário da TI',
      ],
    ]);
  });

  it('tem o que acontece depois de cada um', () => {
    expect(
      TIPOS_DE_CHAMADO_DE_FABRICA.map((tipo) => [
        tipo.nome,
        tipo.podeVirarOs,
        tipo.geraSolicitacao,
        tipo.pedeOAtivo,
        tipo.soATiAbre,
      ]),
    ).toEqual([
      ['Toner', false, 'toner', true, false],
      ['Computador', true, 'nao', true, false],
      ['Impressora', true, 'nao', true, false],
      ['Acesso e senha', false, 'nao', false, false],
      ['Software', false, 'nao', false, false],
      ['Rede e internet', false, 'nao', false, false],
      ['Telefone', false, 'nao', false, false],
      ['Outro', false, 'nao', false, false],
      ['Troca de equipamento', true, 'nao', true, true],
    ]);
  });

  it('deixa todos sem quem atende por padrão, com "Cai na triagem", e aparecendo para o colaborador', () => {
    for (const tipo of TIPOS_DE_CHAMADO_DE_FABRICA) {
      expect(tipo).toMatchObject({
        atendePorPadrao: null,
        semNinguem: 'triagem',
        tipoDeAtivoDoEquipamento: null,
        apareceParaOColaborador: true,
      });
    }
  });

  it('tem os formulários do design', () => {
    expect(formularios()).toEqual({
      Toner: [
        'Qual impressora? · Ativo · obrigatório',
        'Qual cor acabou? · Escolha única · obrigatório · Preto, Ciano, Magenta, Amarelo',
      ],
      Computador: [
        'Qual computador? · Ativo · obrigatório',
        'O que está acontecendo? · Escolha única · obrigatório · Não liga, Está lento, Está travando, Com a tela preta, Sem som, Com o teclado ou o mouse falhando, Sem rede, Com outro problema',
        'Quer contar mais? · Texto longo',
      ],
      Impressora: [
        'Qual impressora? · Ativo · obrigatório',
        'O que está acontecendo? · Escolha única · obrigatório · Manchando, Não puxa o papel, Atolando, Não imprime',
        'Onde as manchas aparecem? · Escolha única · obrigatório · só com Manchando · Na borda, Na página toda',
        'Uma foto ajuda · Anexo',
        'Contador de páginas · Número · só a TI vê',
        'Contrato de manutenção · Sim ou não · só a TI vê',
      ],
      'Acesso e senha': [
        'O que você precisa? · Escolha única · obrigatório · Esqueci a senha, Minha conta bloqueou, Acesso a pasta ou sistema',
        'Qual pasta ou sistema? · Texto curto · obrigatório · só com Acesso a pasta ou sistema',
        'Por que você precisa? · Texto longo · só com Acesso a pasta ou sistema',
      ],
      Software: [
        'O que você precisa? · Escolha única · obrigatório · Instalar um programa, Um programa está com erro',
        'Qual programa? · Texto curto · obrigatório',
        'Quer contar mais? · Texto longo',
      ],
      'Rede e internet': [
        'O que está acontecendo? · Escolha única · obrigatório · Sem internet, Internet lenta, Wi-Fi não conecta, A conexão cai toda hora',
        'Onde você está? · Local · obrigatório',
        'Quer contar mais? · Texto longo',
      ],
      Telefone: [
        'Qual telefone? · Escolha única · obrigatório · Ramal da mesa, Celular da empresa',
        'O que está acontecendo? · Escolha única · obrigatório · Sem tom, Com chiado, Não toca, Não liga',
      ],
      Outro: [
        'Conte o que aconteceu · Texto longo · obrigatório',
        'Onde você está? · Local',
        'Uma foto ajuda · Anexo',
      ],
      'Troca de equipamento': [
        'Qual equipamento? · Ativo · obrigatório',
        'Por quê? · Texto longo · obrigatório',
      ],
    });
  });

  it('tem os ids fixos dos campos e das opções, no formato do formulário', () => {
    const ids = TIPOS_DE_CHAMADO_DE_FABRICA.map(({ nome, formulario }) => [
      nome,
      formulario.campos.map((campo) =>
        campo.opcoes.length > 0
          ? `${campo.id}(${campo.opcoes.map((opcao) => opcao.id).join(',')})`
          : campo.id,
      ),
    ]);
    expect(ids).toEqual([
      ['Toner', ['impressora', 'cor(preto,ciano,magenta,amarelo)']],
      [
        'Computador',
        [
          'computador',
          'problema(nao-liga,lento,travando,tela-preta,sem-som,teclado-ou-mouse,sem-rede,outro-problema)',
          'detalhes',
        ],
      ],
      [
        'Impressora',
        [
          'impressora',
          'problema(manchando,nao-puxa-o-papel,atolando,nao-imprime)',
          'manchas(borda,pagina-toda)',
          'foto',
          'contador-de-paginas',
          'contrato-de-manutencao',
        ],
      ],
      [
        'Acesso e senha',
        [
          'pedido(esqueci-a-senha,conta-bloqueada,acesso-a-pasta-ou-sistema)',
          'pasta-ou-sistema',
          'motivo',
        ],
      ],
      ['Software', ['pedido(instalar,com-erro)', 'programa', 'detalhes']],
      [
        'Rede e internet',
        [
          'problema(sem-internet,internet-lenta,wi-fi-nao-conecta,conexao-cai)',
          'local',
          'detalhes',
        ],
      ],
      [
        'Telefone',
        [
          'telefone(ramal-da-mesa,celular-da-empresa)',
          'problema(sem-tom,com-chiado,nao-toca,nao-liga)',
        ],
      ],
      ['Outro', ['relato', 'local', 'foto']],
      ['Troca de equipamento', ['equipamento', 'motivo']],
    ]);
    const todos = TIPOS_DE_CHAMADO_DE_FABRICA.flatMap(({ formulario }) =>
      formulario.campos.flatMap((campo) => [campo.id, ...campo.opcoes.map((opcao) => opcao.id)]),
    );
    for (const id of todos) expect(id).toMatch(ID_DO_FORMULARIO);
  });

  it('passa cada formulário pelo conferirFormulario sem mudar nada', () => {
    for (const { formulario, pedeOAtivo } of TIPOS_DE_CHAMADO_DE_FABRICA) {
      expect(conferirFormulario(formulario, { pedeOAtivo })).toEqual({ ok: true, formulario });
    }
  });

  it('passa cada tipo pela conferência do tipo, como "Criar o tipo"', () => {
    for (const { formulario, ...pedido } of TIPOS_DE_CHAMADO_DE_FABRICA) {
      const conferencia = conferirTipoDeChamado(pedido, {
        situacao: 'em-uso',
        antes: { geraSolicitacao: 'nao', tipoDeAtivoDoEquipamento: null },
        quemAtende: null,
        tiposDeAtivo: new Set(),
        formulario,
        alcanceDasSolicitacoes: 'organizacao',
        horario: HORARIO_DA_TI_PADRAO,
      });
      expect(conferencia, pedido.nome).toMatchObject({ ok: true });
    }
  });

  it('monta os títulos do design', () => {
    expect(titulo('Toner', { impressora: 'ativo-impressora', cor: 'preto' })).toBe('Toner preto');
    expect(titulo('Computador', { computador: 'ativo-notebook', problema: 'nao-liga' })).toBe(
      'Computador não liga',
    );
    expect(
      titulo('Impressora', {
        impressora: 'ativo-impressora',
        problema: 'manchando',
        manchas: 'borda',
      }),
    ).toBe('Impressora manchando');
    expect(titulo('Acesso e senha', { pedido: 'esqueci-a-senha' })).toBe('Esqueci a senha');
    expect(titulo('Software', { pedido: 'instalar', programa: '7-Zip' })).toBe('Software 7-Zip');
    expect(titulo('Rede e internet', { problema: 'internet-lenta', local: 'local-jundiai' })).toBe(
      'Internet lenta',
    );
    expect(titulo('Telefone', { telefone: 'ramal-da-mesa', problema: 'sem-tom' })).toBe(
      'Telefone sem tom',
    );
    expect(titulo('Outro', { relato: 'O projetor da sala 3 não liga' })).toBe(
      'O projetor da sala 3 não liga',
    );
    expect(
      titulo('Troca de equipamento', { equipamento: 'ativo-notebook', motivo: 'A tela quebrou' }),
    ).toBe('Troca de equipamento NB-0231');
  });

  it('corta o relato do Outro em 120 caracteres', () => {
    const relato = `O projetor da sala 3 não liga ${'e a lâmpada pisca '.repeat(8)}`;
    const montado = titulo('Outro', { relato });

    expect([...montado]).toHaveLength(120);
    expect(montado.endsWith('…')).toBe(true);
  });

  it('dá a cada campo o nome curto no resumo, no molde do m04', () => {
    expect(
      Object.fromEntries(
        TIPOS_DE_CHAMADO_DE_FABRICA.map(({ nome, formulario }) => [
          nome,
          formulario.campos.map(nomeNoResumo),
        ]),
      ),
    ).toEqual({
      Toner: ['Ativo', 'Cor'],
      Computador: ['Ativo', 'Problema', 'Detalhes'],
      Impressora: [
        'Ativo',
        'Problema',
        'Onde as manchas aparecem',
        'Foto',
        'Contador de páginas',
        'Contrato de manutenção',
      ],
      'Acesso e senha': ['Pedido', 'Qual pasta ou sistema', 'Por que você precisa'],
      Software: ['Pedido', 'Programa', 'Detalhes'],
      'Rede e internet': ['Problema', 'Local', 'Detalhes'],
      Telefone: ['Telefone', 'Problema'],
      Outro: ['Relato', 'Local', 'Foto'],
      'Troca de equipamento': ['Ativo', 'Motivo'],
    });
  });

  it('monta o resumo da Impressora do m04', () => {
    const impressora = doTipo('Impressora');
    const respostas = { impressora: 'ativo-impressora', problema: 'manchando', manchas: 'borda' };

    expect(
      resumoDasRespostas(impressora.formulario, respostas, {
        ...CONTEXTO,
        nomeDoTipo: 'Impressora',
      }),
    ).toBe('Problema: Manchando, na borda · Ativo: PAT-00139');
  });
});
