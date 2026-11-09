// As tarefas do painel e a trava (change painel-da-operacao, design, decisão 4; spec
// painel-da-operacao, "Tarefas do painel pelos mesmos comandos"): cada tarefa liga os campos do
// formulário aos argumentos da linha de comando, com as funções do menu onde elas coincidem, e só
// uma roda de cada vez.
import { describe, expect, it } from 'vitest';
import { TAREFAS } from '../windows/menu.ts';
import { canalDeEventos, type EventoDoPainel } from './console.ts';
import { argumentosDaTarefa, executorDeTarefas, TAREFAS_DO_PAINEL } from './tarefas.ts';

describe('as tarefas do painel', () => {
  it('cada tarefa monta os argumentos da linha de comando', () => {
    const casos: [string, Record<string, string>, string[]][] = [
      ['servicos-iniciar', { ambiente: 'teste' }, ['servicos', 'iniciar', '--ambiente', 'teste']],
      ['servicos-parar', { ambiente: 'producao' }, ['servicos', 'parar', '--ambiente', 'producao']],
      [
        'servicos-reiniciar',
        { ambiente: 'producao' },
        ['servicos', 'reiniciar', '--ambiente', 'producao'],
      ],
      [
        'atualizar',
        { zip: 'C:\\Temp\\grafite-0.2.0-windows-x64.zip', ambiente: 'teste' },
        ['atualizar', 'C:\\Temp\\grafite-0.2.0-windows-x64.zip', '--ambiente', 'teste'],
      ],
      ['backup-agora', {}, ['backup', 'agora']],
      ['backup-listar', {}, ['backup', 'listar']],
      ['backup-testar', {}, ['backup', 'testar']],
      ['preparar-teste', {}, ['preparar-teste']],
      [
        'restaurar',
        { backup: '2026-10-28T0500Z' },
        ['restaurar', '2026-10-28T0500Z', '--ambiente', 'producao'],
      ],
      ['voltar', { ambiente: 'producao' }, ['voltar', '--ambiente', 'producao']],
      ['cofre-trocar-chave', {}, ['cofre', 'trocar-chave']],
      [
        'email-configurar',
        { smtp: 'smtp://grafite@smtp.empresa.com.br:587', remetente: 'Grafite <g@empresa.com.br>' },
        [
          'email',
          'configurar',
          '--smtp',
          'smtp://grafite@smtp.empresa.com.br:587',
          '--remetente',
          'Grafite <g@empresa.com.br>',
        ],
      ],
      [
        'email-testar',
        { para: 'ti@empresa.com.br' },
        ['email', 'testar', '--para', 'ti@empresa.com.br'],
      ],
      [
        'backup-configurar',
        {
          destinos: 'D:\\Backups;\\\\nas\\grafite',
          janela: '01:00-05:00',
          retencao: '',
          teste: '',
        },
        [
          'backup',
          'configurar',
          '--destinos',
          'D:\\Backups;\\\\nas\\grafite',
          '--janela',
          '01:00-05:00',
        ],
      ],
      [
        'certificado-configurar',
        { modo: 'publico', email: 'ti@empresa.com.br' },
        ['certificado', 'configurar', '--modo', 'publico', '--email', 'ti@empresa.com.br'],
      ],
      [
        'certificado-configurar',
        { modo: 'interno', ac: 'empresa', certificado: 'D:\\ac\\g.crt', chave: 'D:\\ac\\g.key' },
        [
          'certificado',
          'configurar',
          '--modo',
          'interno',
          '--ac',
          'empresa',
          '--certificado',
          'D:\\ac\\g.crt',
          '--chave',
          'D:\\ac\\g.key',
        ],
      ],
      [
        'enderecos-acrescentar',
        { endereco: 'grafite.acme.example' },
        ['enderecos', 'acrescentar', 'grafite.acme.example'],
      ],
      [
        'enderecos-tirar',
        { endereco: 'grafite.empresa.com.br' },
        ['enderecos', 'tirar', 'grafite.empresa.com.br'],
      ],
    ];
    for (const [id, campos, argumentos] of casos) {
      expect(argumentosDaTarefa(id, campos), id).toEqual(argumentos);
    }
  });

  it('a conta e o acesso usam as funções do menu, com os mesmos campos', () => {
    const criar = {
      ambiente: 'producao',
      endereco: 'grafite.empresa.com.br',
      pessoa: 'Ana Souza',
      usuario: 'ana',
      email: '',
      administrador: 'sim',
    };
    const doMenu = TAREFAS.find(({ rotulo }) => rotulo === 'Criar uma conta');
    expect(doMenu && 'comando' in doMenu ? doMenu.comando(criar) : null).toEqual(
      argumentosDaTarefa('conta-criar', criar),
    );
    expect(argumentosDaTarefa('conta-redefinir', { ...criar, doisPassos: 'não' })).toEqual([
      'conta',
      'redefinir',
      '--ambiente',
      'producao',
      '--endereco',
      'grafite.empresa.com.br',
      '--usuario',
      'ana',
    ]);
  });

  it('o campo obrigatório que falta e o ambiente fora da lista são recusados antes de rodar', () => {
    expect(() => argumentosDaTarefa('email-testar', {})).toThrow(
      'Preencha "E-mail que recebe o teste".',
    );
    expect(() => argumentosDaTarefa('servicos-parar', { ambiente: 'outro' })).toThrow(
      '"Ambiente" deve ser producao ou teste.',
    );
    expect(() => argumentosDaTarefa('apagar-tudo', {})).toThrow(
      'O painel não tem a tarefa apagar-tudo.',
    );
  });

  it('as operações sensíveis são marcadas, para o painel explicar antes', () => {
    expect(TAREFAS_DO_PAINEL.filter(({ sensivel }) => sensivel).map(({ id }) => id)).toEqual([
      'restaurar',
      'voltar',
      'cofre-trocar-chave',
    ]);
  });
});

describe('o executor das tarefas', () => {
  function comCanal(rodar: (argumentos: string[]) => Promise<number>) {
    const canal = canalDeEventos();
    const eventos: EventoDoPainel[] = [];
    canal.ouvir((evento) => eventos.push(evento));
    const chamadas: string[][] = [];
    const executor = executorDeTarefas({
      canal,
      rodar: async (argumentos) => {
        chamadas.push(argumentos);
        return rodar(argumentos);
      },
    });
    return { executor, eventos, chamadas };
  }

  it('Duas tarefas ao mesmo tempo: o backup espera a atualização terminar, e não roda', async () => {
    let terminar: (codigo: number) => void = () => {};
    const { executor, chamadas } = comCanal((argumentos) =>
      argumentos[0] === 'atualizar'
        ? new Promise((resolver) => {
            terminar = resolver;
          })
        : Promise.resolve(0),
    );
    expect(executor.iniciar('atualizar', { zip: 'C:\\Temp\\g.zip', ambiente: 'producao' })).toEqual(
      {
        iniciada: 'Atualizar um ambiente',
      },
    );
    expect(executor.emAndamento()).toBe('Atualizar um ambiente');
    expect(executor.iniciar('backup-agora', {})).toEqual({
      recusada: '"Atualizar um ambiente" está rodando: "Fazer o backup agora" espera ela terminar.',
    });
    expect(chamadas).toEqual([['atualizar', 'C:\\Temp\\g.zip', '--ambiente', 'producao']]);

    terminar(0);
    await executor.terminada();
    expect(executor.emAndamento()).toBeNull();
    expect(executor.iniciar('backup-agora', {})).toEqual({ iniciada: 'Fazer o backup agora' });
    await executor.terminada();
    expect(chamadas).toHaveLength(2);
  });

  it('o fim diz o resultado: o sucesso, ou que a tarefa não terminou', async () => {
    const { executor, eventos } = comCanal(async (argumentos) =>
      argumentos[1] === 'testar' ? 1 : 0,
    );
    executor.iniciar('backup-agora', {});
    await executor.terminada();
    executor.iniciar('backup-testar', {});
    await executor.terminada();
    expect(eventos.filter(({ tipo }) => tipo === 'inicio' || tipo === 'fim')).toEqual([
      { tipo: 'inicio', tarefa: 'Fazer o backup agora' },
      {
        tipo: 'fim',
        tarefa: 'Fazer o backup agora',
        codigo: 0,
        resultado: 'Pronto: Fazer o backup agora.',
      },
      { tipo: 'inicio', tarefa: 'Testar a restauração' },
      {
        tipo: 'fim',
        tarefa: 'Testar a restauração',
        codigo: 1,
        resultado: 'Testar a restauração não terminou: o motivo está acima.',
      },
    ]);
  });

  it('a tarefa recusada antes de rodar não prende a trava', () => {
    const { executor, chamadas } = comCanal(async () => 0);
    expect(executor.iniciar('email-testar', {})).toEqual({
      recusada: 'Preencha "E-mail que recebe o teste".',
    });
    expect(executor.emAndamento()).toBeNull();
    expect(chamadas).toEqual([]);
  });
});
