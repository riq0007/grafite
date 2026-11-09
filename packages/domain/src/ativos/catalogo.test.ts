import { describe, expect, it } from 'vitest';
import {
  CAPACIDADES,
  CAPACIDADES_COM_CARTAO,
  type CampoDaOrganizacao,
  capacidadeDa,
  conferirCamposDoTipo,
  conferirConfiguracaoDasCapacidades,
  conferirPrimeiroCartao,
  ICONES_DE_TIPO,
  PRIORIDADE_DO_PRIMEIRO_CARTAO,
  primeiroCartaoAutomatico,
  ROTULOS_DOS_ICONES,
  recusaDaInativacaoPelaDisponibilidade,
  recusaDaInativacaoPeloIp,
} from './catalogo.ts';

// O primeiro cartão da ficha (change primeiro-cartao-da-ficha, design, decisão 2).
describe('o primeiro cartão da ficha', () => {
  const IMPRESSORA = ['rede.disponibilidade', 'snmp.suprimentos', 'consumiveis.compatibilidade'];
  const recusa = {
    ok: false,
    erro: 'Escolha a Visão geral ou uma capacidade do tipo com cartão na ficha.',
  };

  it('as capacidades com cartão são todas menos o acesso por VNC, e a prioridade é a do pedido', () => {
    expect(CAPACIDADES_COM_CARTAO).toEqual(
      CAPACIDADES.map((capacidade) => capacidade.chave).filter((chave) => chave !== 'acesso.vnc'),
    );
    expect(PRIORIDADE_DO_PRIMEIRO_CARTAO).toEqual([
      'snmp.suprimentos',
      'controlid.saude',
      'hardware.inventario',
      'rede.disponibilidade',
    ]);
  });

  it('o automático é a primeira capacidade da prioridade que o tipo liga, ou a Visão geral', () => {
    expect(primeiroCartaoAutomatico(IMPRESSORA)).toBe('snmp.suprimentos');
    expect(primeiroCartaoAutomatico(['controlid.backup', 'controlid.saude'])).toBe(
      'controlid.saude',
    );
    expect(primeiroCartaoAutomatico(['acesso.vnc', 'rede.disponibilidade'])).toBe(
      'rede.disponibilidade',
    );
    expect(primeiroCartaoAutomatico(['consumiveis.compatibilidade'])).toBe('visao-geral');
    expect(primeiroCartaoAutomatico([])).toBe('visao-geral');
  });

  it('aceita o automático, a Visão geral e uma capacidade ligada com cartão', () => {
    const conferir = (pedido: unknown) =>
      conferirPrimeiroCartao({ pedido, capacidades: IMPRESSORA });
    expect(conferir(undefined)).toEqual({ ok: true, primeiroCartao: null });
    expect(conferir(null)).toEqual({ ok: true, primeiroCartao: null });
    expect(conferir('')).toEqual({ ok: true, primeiroCartao: null });
    expect(conferir('visao-geral')).toEqual({ ok: true, primeiroCartao: 'visao-geral' });
    expect(conferir('consumiveis.compatibilidade')).toEqual({
      ok: true,
      primeiroCartao: 'consumiveis.compatibilidade',
    });
  });

  it('esquece a capacidade desligada, e recusa o que não é um cartão', () => {
    const conferir = (pedido: unknown) =>
      conferirPrimeiroCartao({ pedido, capacidades: IMPRESSORA });
    expect(conferir('controlid.saude')).toEqual({ ok: true, primeiroCartao: null });
    expect(conferir('acesso.vnc')).toEqual(recusa);
    expect(conferir('organizacao:Rede')).toEqual(recusa);
    expect(conferir(5)).toEqual(recusa);
  });
});

describe('os ícones dos tipos', () => {
  it('são os genéricos do F0, cada um com o nome', () => {
    expect(ICONES_DE_TIPO).toEqual([
      'impressora',
      'computador',
      'notebook',
      'monitor',
      'switch',
      'rack',
      'controle-de-acesso',
      'camera',
      'storage',
      'nobreak',
      'generico',
    ]);
    expect(Object.keys(ROTULOS_DOS_ICONES)).toEqual([...ICONES_DE_TIPO]);
    expect(ROTULOS_DOS_ICONES['controle-de-acesso']).toBe('Controle de acesso');
    expect(ROTULOS_DOS_ICONES.camera).toBe('Câmera');
  });
});

describe('as capacidades', () => {
  it('começam pelo inventário de hardware, com identificação e os campos técnicos em chaves fixas', () => {
    expect(CAPACIDADES.map((capacidade) => capacidade.chave)).toEqual([
      'hardware.inventario',
      'rede.disponibilidade',
      'snmp.suprimentos',
      'controlid.saude',
      'controlid.backup',
      'consumiveis.compatibilidade',
      'acesso.vnc',
    ]);
    const inventario = capacidadeDa('hardware.inventario');
    expect(inventario?.nome).toBe('Inventário de hardware');
    expect(
      inventario?.campos.map(({ chave, rotulo, tipo, grupo }) => [chave, rotulo, tipo, grupo]),
    ).toEqual([
      ['hardware.uuid', 'UUID', 'texto', 'Hardware'],
      ['hardware.ip', 'IP do computador', 'ip', 'Hardware'],
      ['hardware.mac', 'MAC', 'mac', 'Hardware'],
      ['hardware.processador', 'Processador', 'texto', 'Hardware'],
      ['hardware.memoria', 'Memória (GB)', 'inteiro', 'Hardware'],
      ['hardware.discos', 'Discos', 'texto-longo', 'Hardware'],
      ['software.sistema', 'Sistema operacional', 'texto', 'Software'],
      ['software.versao-do-sistema', 'Versão do sistema', 'texto', 'Software'],
      ['software.licenca-do-windows', 'Licença do Windows', 'licenca', 'Software'],
      ['software.licenca-do-office', 'Licença do Office', 'licenca', 'Software'],
      ['software.antivirus', 'Antivírus', 'texto', 'Software'],
      ['software.usuario', 'Último usuário informado', 'texto', 'Software'],
      ['software.ultima-inicializacao', 'Última inicialização', 'texto', 'Software'],
    ]);
  });

  it('os campos das capacidades aceitam a importação e a coleta', () => {
    for (const capacidade of CAPACIDADES) {
      for (const campo of capacidade.campos) expect(campo.escrita).toBe('automatica');
    }
  });

  it('a memória vai de 0 a 100.000 GB', () => {
    const memoria = capacidadeDa('hardware.inventario')?.campos.find(
      (campo) => campo.chave === 'hardware.memoria',
    );
    expect(memoria?.configuracao).toEqual({ minimo: 0, maximo: 100_000 });
  });

  it('não acha a capacidade sem código', () => {
    expect(capacidadeDa('mapa.posicao')).toBeUndefined();
  });

  it('o backup do Control iD não traz campos e pede o horário', () => {
    expect(capacidadeDa('controlid.backup')).toMatchObject({
      nome: 'Backup do Control iD',
      descricao:
        'Guarda, todo dia, os usuários, os grupos, os cartões, a biometria, as regras de acesso, os horários e as fotos do controle de acesso.',
      campos: [],
      configuracao: 'backup-do-control-id',
    });
  });

  it('os suprimentos e contadores não trazem campos, pedem o IP, a versão e a comunidade, e dão as colunas numéricas', () => {
    const suprimentos = capacidadeDa('snmp.suprimentos');
    expect(suprimentos).toMatchObject({
      nome: 'Suprimentos e contadores',
      descricao:
        'Lê por SNMP, a cada 10 minutos, os suprimentos, os contadores e as condições da impressora.',
      campos: [],
      configuracao: 'snmp',
    });
    expect(suprimentos?.colunas).toEqual([
      { chave: 'coleta.suprimentos', rotulo: 'Suprimentos', tipo: 'numero', unidade: '%' },
      { chave: 'coleta.paginas', rotulo: 'Total de páginas', tipo: 'numero' },
    ]);
  });

  it('a disponibilidade na rede não traz campos, pede o campo de IP e dá a coluna da situação', () => {
    const disponibilidade = capacidadeDa('rede.disponibilidade');
    expect(disponibilidade).toMatchObject({
      nome: 'Disponibilidade na rede',
      descricao: 'Confere pelo ping, a cada 2 minutos, se o ativo responde na rede.',
      campos: [],
      configuracao: 'campo-de-ip',
    });
    expect(
      disponibilidade?.colunas?.map(({ chave, rotulo, tipo }) => [chave, rotulo, tipo]),
    ).toEqual([['coleta.disponibilidade', 'Disponibilidade', 'situacao']]);
  });

  it('a saúde do Control iD não traz campos, pede o IP, a porta e o login, e dá a coluna da situação', () => {
    const saude = capacidadeDa('controlid.saude');
    expect(saude).toMatchObject({
      nome: 'Saúde do Control iD',
      descricao: 'Confere, a cada 5 minutos, se o controle de acesso responde e aceita o login.',
      campos: [],
      configuracao: 'control-id',
    });
    expect(saude?.colunas).toEqual([
      {
        chave: 'coleta.control-id',
        rotulo: 'Control iD',
        tipo: 'situacao',
        opcoes: [
          { id: 'respondendo', rotulo: 'Respondendo' },
          { id: 'login-recusado', rotulo: 'Login recusado' },
          { id: 'sem-resposta', rotulo: 'Sem resposta' },
          { id: 'resposta-inesperada', rotulo: 'Resposta inesperada' },
          { id: 'sem-dado', rotulo: 'Sem dado' },
          { id: 'nao-verificado', rotulo: 'Não verificado' },
        ],
      },
    ]);
  });

  it('Consumíveis compatíveis ligados na impressora: sem campos, sem configuração e sem colunas', () => {
    expect(capacidadeDa('consumiveis.compatibilidade')).toEqual({
      chave: 'consumiveis.compatibilidade',
      nome: 'Consumíveis compatíveis',
      descricao: 'Os consumíveis que servem nos modelos do tipo, como o toner de cada impressora.',
      campos: [],
    });
  });

  it('as chaves dos campos não se repetem entre as capacidades', () => {
    const chaves = CAPACIDADES.flatMap((capacidade) => capacidade.campos.map((c) => c.chave));
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});

describe('conferirCamposDoTipo', () => {
  const campos: CampoDaOrganizacao[] = [
    { id: 'ip', rotulo: 'IP', tipo: 'ip', situacao: 'ativo' },
    { id: 'mac', rotulo: 'Endereço MAC', tipo: 'mac', situacao: 'ativo' },
    { id: 'tensao', rotulo: 'Tensão', tipo: 'texto', situacao: 'inativo' },
    { id: 'laudo', rotulo: 'Laudo técnico', tipo: 'arquivo', situacao: 'ativo' },
    { id: 'foto', rotulo: 'Foto da etiqueta', tipo: 'imagem', situacao: 'ativo' },
  ];

  it('aceita a lista em ordem, com os obrigatórios', () => {
    const pedidos = [
      { campoId: 'mac', obrigatorio: false },
      { campoId: 'ip', obrigatorio: true },
    ];
    expect(conferirCamposDoTipo([], pedidos, campos)).toEqual({ ok: true, campos: pedidos });
  });

  it('recusa a inclusão nova de um campo inativo', () => {
    expect(conferirCamposDoTipo([], [{ campoId: 'tensao', obrigatorio: false }], campos)).toEqual({
      ok: false,
      erro: 'O campo Tensão está inativo.',
    });
  });

  it('mantém o campo inativo que já estava no tipo', () => {
    const pedidos = [
      { campoId: 'tensao', obrigatorio: false },
      { campoId: 'ip', obrigatorio: false },
    ];
    expect(conferirCamposDoTipo(['tensao'], pedidos, campos)).toEqual({
      ok: true,
      campos: pedidos,
    });
  });

  it('recusa o campo repetido e o que não é da organização', () => {
    expect(
      conferirCamposDoTipo(
        [],
        [
          { campoId: 'ip', obrigatorio: false },
          { campoId: 'ip', obrigatorio: true },
        ],
        campos,
      ),
    ).toEqual({ ok: false, erro: 'O campo IP aparece duas vezes.' });
    expect(conferirCamposDoTipo([], [{ campoId: 'outro', obrigatorio: false }], campos)).toEqual({
      ok: false,
      erro: 'Campo não encontrado.',
    });
  });

  it('recusa o arquivo e a imagem obrigatórios, porque eles são enviados depois do cadastro', () => {
    const recusa = {
      ok: false,
      erro: 'Arquivo e imagem não podem ser obrigatórios: eles são enviados depois do cadastro.',
    };
    expect(conferirCamposDoTipo([], [{ campoId: 'laudo', obrigatorio: true }], campos)).toEqual(
      recusa,
    );
    expect(conferirCamposDoTipo([], [{ campoId: 'foto', obrigatorio: true }], campos)).toEqual(
      recusa,
    );
    const opcionais = [
      { campoId: 'laudo', obrigatorio: false },
      { campoId: 'foto', obrigatorio: false },
    ];
    expect(conferirCamposDoTipo([], opcionais, campos)).toEqual({ ok: true, campos: opcionais });
  });

  it('recusa mais de 100 campos', () => {
    const muitos: CampoDaOrganizacao[] = Array.from({ length: 101 }, (_, i) => ({
      id: `c${i}`,
      rotulo: `Campo ${i}`,
      tipo: 'texto',
      situacao: 'ativo',
    }));
    const pedidos = muitos.map((campo) => ({ campoId: campo.id, obrigatorio: false }));
    expect(conferirCamposDoTipo([], pedidos, muitos)).toEqual({
      ok: false,
      erro: 'Use até 100 campos por tipo.',
    });
  });
});

describe('conferirConfiguracaoDasCapacidades', () => {
  const IP = '0199a6e0-0000-7000-8000-0000000000c1';
  const GERENCIA = '0199a6e0-0000-7000-8000-0000000000c2';
  const HOSTNAME = '0199a6e0-0000-7000-8000-0000000000c3';
  const VELHO = '0199a6e0-0000-7000-8000-0000000000c4';
  const definicoes: CampoDaOrganizacao[] = [
    { id: IP, rotulo: 'IP', tipo: 'ip', situacao: 'ativo' },
    { id: GERENCIA, rotulo: 'IP da gerência', tipo: 'ip', situacao: 'ativo' },
    { id: HOSTNAME, rotulo: 'Hostname de gerência', tipo: 'texto', situacao: 'ativo' },
    { id: VELHO, rotulo: 'IP antigo', tipo: 'ip', situacao: 'inativo' },
  ];
  const doTipo = [IP, GERENCIA, HOSTNAME, VELHO];
  const conferir = (
    configuracao: unknown,
    {
      capacidades = ['rede.disponibilidade'],
      campos = doTipo,
      atual = {},
    }: {
      capacidades?: string[];
      campos?: string[];
      atual?: Record<string, unknown>;
    } = {},
  ) =>
    conferirConfiguracaoDasCapacidades({
      capacidades,
      configuracao,
      campos,
      atual,
      definicoes,
    });

  it('aceita a disponibilidade com um campo de IP ativo do tipo', () => {
    expect(conferir({ 'rede.disponibilidade': { campoDoIp: GERENCIA } })).toEqual({
      ok: true,
      configuracao: { 'rede.disponibilidade': { campoDoIp: GERENCIA } },
    });
  });

  it('pede o campo de IP ao ligar a disponibilidade', () => {
    for (const configuracao of [undefined, {}, { 'rede.disponibilidade': {} }]) {
      expect(conferir(configuracao)).toEqual({
        ok: false,
        erro: 'Escolha o campo de IP que o ping usa.',
        onde: 'configuracao',
      });
    }
  });

  it('recusa o campo que não é do tipo IP, o que está fora do tipo e o inativo', () => {
    expect(conferir({ 'rede.disponibilidade': { campoDoIp: HOSTNAME } })).toEqual({
      ok: false,
      erro: 'O campo Hostname de gerência não é do tipo IP.',
      onde: 'configuracao',
    });
    expect(conferir({ 'rede.disponibilidade': { campoDoIp: GERENCIA } }, { campos: [IP] })).toEqual(
      { ok: false, erro: 'Escolha um campo de IP que esteja no tipo.', onde: 'configuracao' },
    );
    expect(conferir({ 'rede.disponibilidade': { campoDoIp: VELHO } })).toEqual({
      ok: false,
      erro: 'O campo IP antigo está inativo.',
      onde: 'configuracao',
    });
  });

  it('recusa tirar do tipo o campo que é o IP da disponibilidade', () => {
    expect(
      conferir(
        { 'rede.disponibilidade': { campoDoIp: IP } },
        { campos: [GERENCIA], atual: { 'rede.disponibilidade': { campoDoIp: IP } } },
      ),
    ).toEqual({
      ok: false,
      erro: 'O campo IP é o IP da disponibilidade neste tipo: escolha outro antes de tirá-lo.',
      onde: 'campos',
    });
  });

  it('esquece a configuração da capacidade desligada e a de capacidade desconhecida', () => {
    expect(
      conferir(
        {
          'rede.disponibilidade': { campoDoIp: IP },
          'snmp.suprimentos': { campoDoIp: IP },
          'controlid.backup': { senha: 'x' },
        },
        { capacidades: [] },
      ),
    ).toEqual({ ok: true, configuracao: {} });
  });

  // Os suprimentos e contadores (spec impressoras-por-snmp; change p2b-impressoras-por-snmp,
  // design, decisão 3): o campo de IP pelas regras da disponibilidade, a versão e a comunidade.
  describe('os suprimentos e contadores', () => {
    const COMUNIDADE = '0199a6e0-0000-7000-8000-0000000000e1';
    const doSnmp = (
      configuracao: unknown,
      opcoes: { campos?: string[]; atual?: Record<string, unknown> } = {},
    ) => conferir(configuracao, { capacidades: ['snmp.suprimentos'], ...opcoes });

    it('aceita o campo de IP, a versão e a comunidade do cofre; sem elas, a 2c e a public', () => {
      expect(
        doSnmp({ 'snmp.suprimentos': { campoDoIp: IP, versao: '1', segredoId: COMUNIDADE } }),
      ).toEqual({
        ok: true,
        configuracao: { 'snmp.suprimentos': { campoDoIp: IP, versao: '1', segredoId: COMUNIDADE } },
      });
      expect(doSnmp({ 'snmp.suprimentos': { campoDoIp: IP } })).toEqual({
        ok: true,
        configuracao: { 'snmp.suprimentos': { campoDoIp: IP, versao: '2c', segredoId: null } },
      });
    });

    it('pede o campo de IP que o SNMP usa, pelas regras do campo de IP', () => {
      expect(doSnmp({ 'snmp.suprimentos': { versao: '2c' } })).toEqual({
        ok: false,
        erro: 'Escolha o campo de IP que o SNMP usa.',
        onde: 'configuracao',
      });
      expect(doSnmp({ 'snmp.suprimentos': { campoDoIp: HOSTNAME } })).toEqual({
        ok: false,
        erro: 'O campo Hostname de gerência não é do tipo IP.',
        onde: 'configuracao',
      });
      expect(doSnmp({ 'snmp.suprimentos': { campoDoIp: VELHO } })).toEqual({
        ok: false,
        erro: 'O campo IP antigo está inativo.',
        onde: 'configuracao',
      });
    });

    it('recusa a versão que não é 1 nem 2c, e a comunidade que não é um segredo', () => {
      expect(doSnmp({ 'snmp.suprimentos': { campoDoIp: IP, versao: '3' } })).toEqual({
        ok: false,
        erro: 'Escolha a versão 1 ou 2c do SNMP.',
        onde: 'configuracao',
      });
      expect(doSnmp({ 'snmp.suprimentos': { campoDoIp: IP, segredoId: 'public' } })).toEqual({
        ok: false,
        erro: 'Escolha uma comunidade SNMP ativa do cofre.',
        onde: 'configuracao',
      });
    });

    it('a disponibilidade e os suprimentos ligados juntos, cada um com o seu campo de IP', () => {
      expect(
        conferir(
          {
            'rede.disponibilidade': { campoDoIp: IP },
            'snmp.suprimentos': { campoDoIp: GERENCIA, versao: '2c', segredoId: null },
          },
          { capacidades: ['rede.disponibilidade', 'snmp.suprimentos'] },
        ),
      ).toEqual({
        ok: true,
        configuracao: {
          'rede.disponibilidade': { campoDoIp: IP },
          'snmp.suprimentos': { campoDoIp: GERENCIA, versao: '2c', segredoId: null },
        },
      });
    });

    it('recusa tirar do tipo o campo que é o IP dos suprimentos, dizendo qual capacidade o usa', () => {
      expect(
        doSnmp(
          { 'snmp.suprimentos': { campoDoIp: IP } },
          { campos: [GERENCIA], atual: { 'snmp.suprimentos': { campoDoIp: IP } } },
        ),
      ).toEqual({
        ok: false,
        erro: 'O campo IP é o IP dos suprimentos e contadores neste tipo: escolha outro antes de tirá-lo.',
        onde: 'campos',
      });
    });
  });
});

describe('a configuração da saúde do Control iD', () => {
  const IP = '0199a6e0-0000-7000-8000-0000000000c1';
  const GERENCIA = '0199a6e0-0000-7000-8000-0000000000c2';
  const LOGIN = '0199a6e0-0000-7000-8000-0000000000f1';
  const definicoes: CampoDaOrganizacao[] = [
    { id: IP, rotulo: 'IP', tipo: 'ip', situacao: 'ativo' },
    { id: GERENCIA, rotulo: 'IP da gerência', tipo: 'ip', situacao: 'ativo' },
  ];
  const conferir = (
    configuracao: unknown,
    { campos = [IP, GERENCIA], atual = {} }: { campos?: string[]; atual?: object } = {},
  ) =>
    conferirConfiguracaoDasCapacidades({
      capacidades: ['controlid.saude'],
      configuracao: { 'controlid.saude': configuracao },
      campos,
      atual,
      definicoes,
    });
  const recusa = (erro: string, onde = 'configuracao') => ({ ok: false, erro, onde });

  it('aceita o campo de IP, a porta e o login do cofre; sem a porta, a 80', () => {
    expect(conferir({ campoDoIp: IP, porta: 8080, segredoId: LOGIN })).toEqual({
      ok: true,
      configuracao: { 'controlid.saude': { campoDoIp: IP, porta: 8080, segredoId: LOGIN } },
    });
    expect(conferir({ campoDoIp: IP, segredoId: LOGIN.toUpperCase() })).toEqual({
      ok: true,
      configuracao: { 'controlid.saude': { campoDoIp: IP, porta: 80, segredoId: LOGIN } },
    });
  });

  it('pede o campo de IP que a sondagem usa', () => {
    expect(conferir({ porta: 80, segredoId: LOGIN })).toEqual(
      recusa('Escolha o campo de IP que a sondagem usa.'),
    );
  });

  // O login do tipo é opcional (change login-de-cada-controle, design, decisão 1): sem ele, só os
  // controles com login próprio são sondados.
  it('aceita o tipo sem login', () => {
    const semLogin = {
      ok: true,
      configuracao: { 'controlid.saude': { campoDoIp: IP, porta: 80, segredoId: null } },
    };
    expect(conferir({ campoDoIp: IP, porta: 80 })).toEqual(semLogin);
    expect(conferir({ campoDoIp: IP, segredoId: null })).toEqual(semLogin);
    expect(conferir({ campoDoIp: IP, segredoId: '' })).toEqual(semLogin);
  });

  it('recusa o login fora do formato', () => {
    expect(conferir({ campoDoIp: IP, segredoId: 'admin' })).toEqual(
      recusa(
        'Escolha um login ativo do cofre, do tipo Usuário e senha ou Conta administrativa, com o usuário preenchido.',
      ),
    );
  });

  it('recusa a porta fora de 1 a 65535', () => {
    for (const porta of [0, 65536, 80.5, '80']) {
      expect(conferir({ campoDoIp: IP, porta, segredoId: LOGIN })).toEqual(
        recusa('Informe uma porta de 1 a 65535.'),
      );
    }
  });

  it('recusa tirar do tipo o campo que é o IP da sondagem', () => {
    expect(
      conferir(
        { campoDoIp: IP, porta: 80, segredoId: LOGIN },
        { campos: [GERENCIA], atual: { 'controlid.saude': { campoDoIp: IP } } },
      ),
    ).toEqual(
      recusa(
        'O campo IP é o IP da saúde do Control iD neste tipo: escolha outro antes de tirá-lo.',
        'campos',
      ),
    );
  });
});

describe('recusaDaInativacaoPeloIp', () => {
  it('diz qual capacidade usa o campo, e em quantos tipos', () => {
    expect(recusaDaInativacaoPeloIp('IP', 'controlid.saude', 1)).toBe(
      'O campo IP é o IP da saúde do Control iD em 1 tipo: escolha outro campo nele antes de inativá-lo.',
    );
    expect(recusaDaInativacaoPeloIp('IP', 'snmp.suprimentos', 1)).toBe(
      'O campo IP é o IP dos suprimentos e contadores em 1 tipo: escolha outro campo nele antes de inativá-lo.',
    );
    expect(recusaDaInativacaoPeloIp('IP', 'rede.disponibilidade', 3)).toBe(
      'O campo IP é o IP da disponibilidade em 3 tipos: escolha outro campo neles antes de inativá-lo.',
    );
  });
});

describe('recusaDaInativacaoPelaDisponibilidade', () => {
  it('diz em quantos tipos o campo é o IP da disponibilidade', () => {
    expect(recusaDaInativacaoPelaDisponibilidade('IP', 2)).toBe(
      'O campo IP é o IP da disponibilidade em 2 tipos: escolha outro campo neles antes de inativá-lo.',
    );
    expect(recusaDaInativacaoPelaDisponibilidade('IP', 1)).toBe(
      'O campo IP é o IP da disponibilidade em 1 tipo: escolha outro campo nele antes de inativá-lo.',
    );
  });
});

// O backup do Control iD (spec backup-do-control-id, "Backup do Control iD no tipo"; change
// p5a-backup-do-control-id, design, decisão 1): o horário, com a saúde do Control iD no tipo.
describe('a configuração do backup do Control iD', () => {
  const IP = '0199a6e0-0000-7000-8000-0000000000c1';
  const LOGIN = '0199a6e0-0000-7000-8000-0000000000f1';
  const definicoes: CampoDaOrganizacao[] = [
    { id: IP, rotulo: 'IP', tipo: 'ip', situacao: 'ativo' },
  ];
  const saude = { campoDoIp: IP, porta: 80, segredoId: LOGIN };
  const conferir = (capacidades: string[], backup: unknown) =>
    conferirConfiguracaoDasCapacidades({
      capacidades,
      configuracao: { 'controlid.saude': saude, 'controlid.backup': backup },
      campos: [IP],
      atual: {},
      definicoes,
    });

  it('Backup ligado no tipo: guarda o horário, com as 02:00 sem escolha', () => {
    expect(conferir(['controlid.saude', 'controlid.backup'], { horario: '03:30' })).toEqual({
      ok: true,
      configuracao: { 'controlid.saude': saude, 'controlid.backup': { horario: '03:30' } },
    });
    expect(conferir(['controlid.saude', 'controlid.backup'], undefined)).toEqual({
      ok: true,
      configuracao: { 'controlid.saude': saude, 'controlid.backup': { horario: '02:00' } },
    });
  });

  it('Sem a saúde do Control iD: o backup usa o IP, a porta e o login dela', () => {
    expect(conferir(['controlid.backup'], { horario: '02:00' })).toEqual({
      ok: false,
      erro: 'Ligue a saúde do Control iD no tipo: o backup usa o mesmo IP, a mesma porta e o mesmo login.',
      onde: 'configuracao',
    });
  });

  it('recusa o horário fora do formato', () => {
    for (const horario of ['2:00', '24:00', '02:60', 'meia-noite', 200]) {
      expect(conferir(['controlid.saude', 'controlid.backup'], { horario })).toEqual({
        ok: false,
        erro: 'Informe o horário como 02:00.',
        onde: 'configuracao',
      });
    }
  });
});

// O acesso remoto (spec acesso-remoto, "Capacidade do acesso remoto"; change acesso-remoto-vnc,
// design, decisão 1): a porta do VNC, com a disponibilidade na rede no tipo.
describe('a configuração do acesso remoto', () => {
  const IP = '0199a6e0-0000-7000-8000-0000000000c1';
  const definicoes: CampoDaOrganizacao[] = [
    { id: IP, rotulo: 'IP', tipo: 'ip', situacao: 'ativo' },
  ];
  const conferir = (capacidades: string[], vnc: unknown) =>
    conferirConfiguracaoDasCapacidades({
      capacidades,
      configuracao: { 'rede.disponibilidade': { campoDoIp: IP }, 'acesso.vnc': vnc },
      campos: [IP],
      atual: {},
      definicoes,
    });

  it('Tipo com o acesso remoto: a porta 5900 sem escolha', () => {
    expect(capacidadeDa('acesso.vnc')).toMatchObject({
      nome: 'Acesso remoto por VNC',
      descricao: 'Abre a tela da máquina no navegador, pelo VNC.',
      campos: [],
      configuracao: 'acesso-remoto',
    });
    expect(conferir(['rede.disponibilidade', 'acesso.vnc'], undefined)).toEqual({
      ok: true,
      configuracao: { 'rede.disponibilidade': { campoDoIp: IP }, 'acesso.vnc': { porta: 5900 } },
    });
    expect(conferir(['rede.disponibilidade', 'acesso.vnc'], { porta: 5901 })).toMatchObject({
      ok: true,
      configuracao: { 'acesso.vnc': { porta: 5901 } },
    });
  });

  it('recusa sem a disponibilidade na rede e a porta fora dos limites', () => {
    expect(conferir(['acesso.vnc'], { porta: 5900 })).toEqual({
      ok: false,
      erro: 'Ligue a disponibilidade na rede no tipo: o acesso remoto usa o mesmo IP.',
      onde: 'configuracao',
    });
    for (const porta of [0, 70000, 'x']) {
      expect(conferir(['rede.disponibilidade', 'acesso.vnc'], { porta })).toEqual({
        ok: false,
        erro: 'Informe a porta de 1 a 65535.',
        onde: 'configuracao',
      });
    }
  });
});
