// As tarefas do menu da operação (change instalador-e-menu-da-operacao, design, decisão 5; spec
// operacao-servicos, "Menu da operação"): cada uma pergunta os campos, com os padrões da instalação,
// e monta os argumentos do mesmo comando da linha de comando.
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consoleRoteirizado } from '../../test/console-roteirizado.ts';
import type { EstadoDaInstalacao } from '../estado.ts';
import {
  argumentosDaTarefa,
  type PadroesDoMenu,
  padroesDoMenu,
  TAREFAS,
  zipMaisNovo,
} from './menu.ts';

const PADROES: PadroesDoMenu = {
  enderecos: {
    producao: ['grafite.empresa.com.br'],
    teste: ['grafite-teste.empresa.com.br'],
  },
  zip: 'C:\\Users\\ana\\Downloads\\grafite-0.1.2-windows-x64.zip',
  logs: 'D:\\Grafite\\producao\\logs',
};

/** Os argumentos da tarefa de rótulo dado, com as respostas em ordem. */
async function montar(rotulo: string, ...respostas: string[]) {
  const tarefa = TAREFAS.find((candidata) => candidata.rotulo === rotulo);
  if (tarefa === undefined) throw new Error(`Não há a tarefa ${rotulo}.`);
  const roteiro = consoleRoteirizado(...respostas);
  const argumentos = await argumentosDaTarefa(tarefa, roteiro.console, PADROES);
  return { argumentos, roteiro };
}

describe('as tarefas do menu', () => {
  it('são as onze da spec, na ordem do dia a dia', () => {
    expect(TAREFAS.map(({ rotulo }) => rotulo)).toEqual([
      'Estado dos serviços',
      'Criar uma conta',
      'Redefinir um acesso',
      'Fazer o backup agora',
      'Listar os backups',
      'Configurar o e-mail',
      'Testar o e-mail',
      'Atualizar um ambiente',
      'Preparar o teste',
      'Reiniciar um ambiente',
      'Abrir a pasta dos logs',
    ]);
  });

  it.each([
    ['Estado dos serviços', [], ['servicos', 'estado']],
    ['Fazer o backup agora', [], ['backup', 'agora']],
    ['Listar os backups', [], ['backup', 'listar']],
    ['Preparar o teste', [], ['preparar-teste']],
    [
      'Configurar o e-mail',
      ['smtp://grafite@smtp.empresa.com.br:587', 'Grafite <grafite@empresa.com.br>'],
      [
        'email',
        'configurar',
        '--smtp',
        'smtp://grafite@smtp.empresa.com.br:587',
        '--remetente',
        'Grafite <grafite@empresa.com.br>',
      ],
    ],
    ['Testar o e-mail', ['ti@empresa.com.br'], ['email', 'testar', '--para', 'ti@empresa.com.br']],
    ['Reiniciar um ambiente', [''], ['servicos', 'reiniciar', '--ambiente', 'producao']],
    ['Reiniciar um ambiente', ['teste'], ['servicos', 'reiniciar', '--ambiente', 'teste']],
  ])('%s, com %j, monta %j', async (rotulo, respostas, esperado) => {
    const { argumentos, roteiro } = await montar(rotulo, ...respostas);
    expect(argumentos).toEqual(esperado);
    expect(roteiro.sobra()).toBe(0);
  });

  it('cria a conta na produção, na organização que opera o servidor (Conta criada pelo menu)', async () => {
    const { argumentos, roteiro } = await montar(
      'Criar uma conta',
      '',
      '',
      'Bruno Lima',
      'bruno',
      '',
      'sim',
    );
    expect(roteiro.perguntas).toEqual([
      'Ambiente (producao ou teste)',
      'Endereço da organização',
      'Nome da pessoa',
      'Usuário da conta',
      'E-mail da pessoa (opcional)',
      'A pessoa é administradora? (sim ou não)',
    ]);
    expect(argumentos).toEqual([
      'conta',
      'criar',
      '--ambiente',
      'producao',
      '--endereco',
      'grafite.empresa.com.br',
      '--pessoa',
      'Bruno Lima',
      '--usuario',
      'bruno',
      '--administrador',
    ]);
  });

  it('no teste, propõe o endereço da organização no teste, e o e-mail vai quando é dado', async () => {
    const { argumentos } = await montar(
      'Criar uma conta',
      'teste',
      '',
      'Carla Dias',
      'carla',
      'carla@empresa.com.br',
      '',
    );
    expect(argumentos).toEqual([
      'conta',
      'criar',
      '--ambiente',
      'teste',
      '--endereco',
      'grafite-teste.empresa.com.br',
      '--pessoa',
      'Carla Dias',
      '--usuario',
      'carla',
      '--email',
      'carla@empresa.com.br',
    ]);
  });

  it('redefine o acesso, e só tira os dois passos com o sim', async () => {
    expect((await montar('Redefinir um acesso', '', '', 'bruno', '')).argumentos).toEqual([
      'conta',
      'redefinir',
      '--ambiente',
      'producao',
      '--endereco',
      'grafite.empresa.com.br',
      '--usuario',
      'bruno',
    ]);
    expect((await montar('Redefinir um acesso', '', '', 'bruno', 'sim')).argumentos).toContain(
      '--remover-dois-passos',
    );
  });

  it('atualiza o teste com o zip mais novo, por padrão, e a produção quando escolhida', async () => {
    expect((await montar('Atualizar um ambiente', '', '')).argumentos).toEqual([
      'atualizar',
      PADROES.zip,
      '--ambiente',
      'teste',
    ]);
    expect(
      (await montar('Atualizar um ambiente', 'D:\\grafite.zip', 'producao')).argumentos,
    ).toEqual(['atualizar', 'D:\\grafite.zip', '--ambiente', 'producao']);
  });

  it('abre a pasta dos logs da produção pelo Explorer, sem perguntar nada', async () => {
    const tarefa = TAREFAS.at(-1);
    expect(tarefa !== undefined && 'programa' in tarefa && tarefa.programa(PADROES)).toEqual({
      arquivo: 'explorer.exe',
      argumentos: ['D:\\Grafite\\producao\\logs'],
    });
  });

  it('recusa a resposta fora das opções e a obrigatória em branco, e pergunta de novo', async () => {
    const { argumentos, roteiro } = await montar('Reiniciar um ambiente', 'homologacao', 'teste');
    expect(argumentos).toEqual(['servicos', 'reiniciar', '--ambiente', 'teste']);
    expect(roteiro.escritos).toEqual(['Responda producao ou teste.']);

    const email = await montar('Testar o e-mail', '', 'ti@empresa.com.br');
    expect(email.roteiro.escritos).toEqual(['Esta resposta é obrigatória.']);
  });

  it('desiste da tarefa depois de três respostas que não servem', async () => {
    await expect(montar('Testar o e-mail', '', '', '')).rejects.toThrow(
      'Sem resposta para "E-mail que recebe o teste" depois de três tentativas: a tarefa não rodou.',
    );
  });
});

describe('os padrões do menu', () => {
  it('vêm do operacao.json: os endereços de cada ambiente e a pasta dos logs da produção', () => {
    const estado = {
      raiz: 'D:\\Grafite',
      plataforma: 'windows',
      ambientes: {
        producao: { enderecos: ['grafite.empresa.com.br'], porta: 3000, atual: '0.1.1' },
        teste: { enderecos: ['grafite-teste.empresa.com.br'], porta: 3001, atual: '0.1.1' },
      },
    } as unknown as EstadoDaInstalacao;
    expect(padroesDoMenu(estado, undefined)).toEqual({
      enderecos: {
        producao: ['grafite.empresa.com.br'],
        teste: ['grafite-teste.empresa.com.br'],
      },
      logs: join('D:\\Grafite', 'producao', 'logs'),
    });
  });

  describe('o zip mais novo', () => {
    let pasta: string;

    beforeEach(async () => {
      pasta = await mkdtemp(join(tmpdir(), 'grafite-menu-'));
    });

    afterEach(async () => {
      await rm(pasta, { recursive: true, force: true });
    });

    it('é o grafite-*-windows-x64.zip mais recente das pastas, e nenhum quando não há', async () => {
      const downloads = join(pasta, 'Downloads');
      const temp = join(pasta, 'Temp');
      await mkdir(downloads);
      await mkdir(temp);
      expect(await zipMaisNovo([downloads, temp, join(pasta, 'nao-existe')])).toBeUndefined();

      const antigo = join(downloads, 'grafite-0.1.1-windows-x64.zip');
      const novo = join(temp, 'grafite-0.1.2-windows-x64.zip');
      await writeFile(antigo, 'a');
      await writeFile(novo, 'b');
      await writeFile(join(downloads, 'outro.zip'), 'c');
      await utimes(antigo, new Date('2026-10-01'), new Date('2026-10-01'));
      await utimes(novo, new Date('2026-10-20'), new Date('2026-10-20'));

      expect(await zipMaisNovo([downloads, temp])).toBe(novo);
    });
  });
});
