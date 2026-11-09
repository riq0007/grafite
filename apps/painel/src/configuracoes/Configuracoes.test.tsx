// As configurações pelo painel (spec painel-da-operacao, "Configurações no painel"): o e-mail, com o
// envio de teste, o backup, o certificado, os endereços e as contas, pelos comandos de operação. Os
// valores atuais vêm da instalação, e os segredos não voltam para a página.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiEmMemoria } from '../../simulado/api-em-memoria.ts';
import { App } from '../App.tsx';

afterEach(() => {
  cleanup();
});

const andamento = () => screen.findByRole('region', { name: 'Andamento da tarefa' });
const secao = (nome: string) => screen.findByRole('region', { name: nome });
const campo = (dentro: HTMLElement, rotulo: string) =>
  within(dentro).getByRole('textbox', { name: rotulo }) as HTMLInputElement;

async function abrirConfiguracoes() {
  fireEvent.click(await screen.findByRole('tab', { name: 'Configurações' }));
}

async function responder(titulo: string, resposta: string | null, botao: string) {
  const dialogo = await screen.findByRole('dialog', { name: titulo });
  const entrada = dialogo.querySelector('input') as HTMLInputElement;
  if (resposta !== null) fireEvent.change(entrada, { target: { value: resposta } });
  fireEvent.click(within(dialogo).getByRole('button', { name: botao }));
  return { dialogo, entrada };
}

describe('as configurações', () => {
  it('Senha do e-mail fora da página: mostra o servidor e o remetente e diz que a senha está configurada', async () => {
    const { api } = apiEmMemoria();
    render(<App api={api} />);
    await abrirConfiguracoes();
    const email = await secao('E-mail');
    expect(campo(email, 'Endereço do servidor de e-mail').value).toBe(
      'smtp://grafite@smtp.empresa.com.br:587',
    );
    expect(campo(email, 'Remetente').value).toBe('Grafite <grafite@empresa.com.br>');
    expect(email.textContent).toContain('A senha está configurada e não aparece aqui.');
  });

  it('Tarefa que falha: o teste do e-mail recusado pelo servidor de e-mail mostra o motivo', async () => {
    const { api } = apiEmMemoria();
    render(<App api={api} />);
    await abrirConfiguracoes();
    const email = await secao('E-mail');
    fireEvent.change(campo(email, 'E-mail que recebe o teste'), {
      target: { value: 'ti@empresa.com.br' },
    });
    fireEvent.click(within(email).getByRole('button', { name: 'Mandar o e-mail de teste' }));
    await screen.findByText('Testar o e-mail não terminou: o motivo está acima.');
    expect((await andamento()).textContent).toContain(
      'O servidor de e-mail recusou a autenticação.',
    );
  });

  it('Destino do backup acrescentado: o comando grava, e o painel mostra os destinos novos', async () => {
    const { api, pedidas } = apiEmMemoria();
    render(<App api={api} />);
    await abrirConfiguracoes();
    const backup = await secao('Backup');
    fireEvent.change(campo(backup, 'Destino novo'), { target: { value: '\\\\nas02\\grafite' } });
    fireEvent.click(within(backup).getByRole('button', { name: 'Acrescentar o destino' }));
    fireEvent.click(within(backup).getByRole('button', { name: 'Gravar o backup' }));
    await vi.waitFor(async () =>
      expect((await andamento()).textContent).toContain(
        'O backup da produção está configurado, e o app reiniciou com saúde.',
      ),
    );
    expect(pedidas.at(-1)).toEqual({
      tarefa: 'backup-configurar',
      campos: {
        destinos: 'D:\\Backups\\Grafite;\\\\nas01\\backups\\grafite;\\\\nas02\\grafite',
        janela: '00:00-06:00',
        retencao: '7,4,12',
        teste: 'semanal',
      },
    });
    await vi.waitFor(async () =>
      expect((await secao('Backup')).textContent).toContain('\\\\nas02\\grafite'),
    );
  });

  it('o certificado público pede o token sem mostrá-lo', async () => {
    const { api } = apiEmMemoria();
    render(<App api={api} />);
    await abrirConfiguracoes();
    const certificado = await secao('Certificado');
    expect(certificado.textContent).toContain(
      'O token do DNS está configurado e não aparece aqui.',
    );
    fireEvent.click(within(certificado).getByRole('button', { name: 'Gravar o certificado' }));
    const { dialogo, entrada } = await responder(
      'Senha',
      'token-secreto-da-cloudflare',
      'Responder',
    );
    expect(dialogo.textContent).toContain('Token da Cloudflare');
    expect(entrada.getAttribute('type')).toBe('password');
    await vi.waitFor(async () =>
      expect((await andamento()).textContent).toContain('O certificado do proxy mudou'),
    );
    expect(document.body.textContent).not.toContain('token-secreto-da-cloudflare');
  });

  it('acrescenta um endereço, com o do teste proposto pelo comando', async () => {
    const { api } = apiEmMemoria();
    render(<App api={api} />);
    await abrirConfiguracoes();
    const enderecos = await secao('Endereços');
    expect(enderecos.textContent).toContain('grafite-teste.empresa.com.br');
    fireEvent.change(campo(enderecos, 'Endereço novo da produção'), {
      target: { value: 'grafite.acme.example' },
    });
    fireEvent.click(within(enderecos).getByRole('button', { name: 'Acrescentar o endereço' }));
    const { entrada } = await responder('Pergunta', null, 'Responder');
    expect(entrada.value).toBe('grafite-teste.acme.example');
    await vi.waitFor(async () =>
      expect((await andamento()).textContent).toContain(
        'Cadastre os dois no DNS da empresa, apontando para este servidor.',
      ),
    );
  });

  it('Conta criada pelo painel: a administradora na produção, e a senha temporária aparece uma vez, com o aviso', async () => {
    const { api } = apiEmMemoria();
    render(<App api={api} />);
    await abrirConfiguracoes();
    const contas = await secao('Criar uma conta');
    expect(campo(contas, 'Endereço da organização').value).toBe('grafite.empresa.com.br');
    fireEvent.change(campo(contas, 'Nome da pessoa'), { target: { value: 'Ana Souza' } });
    fireEvent.change(campo(contas, 'Usuário da conta'), { target: { value: 'ana' } });
    fireEvent.click(within(contas).getByRole('radio', { name: 'Administradora' }));
    fireEvent.click(within(contas).getByRole('button', { name: 'Criar a conta' }));
    await vi.waitFor(async () =>
      expect((await andamento()).textContent).toContain(
        'Conta ana (Ana Souza) criada na organização do endereço grafite.empresa.com.br, com o perfil Administrador.',
      ),
    );
    const texto = (await andamento()).textContent ?? '';
    expect(texto).toContain('Senha temporária: 7Q4-TV8-KJ2-P3M');
    expect(texto).toContain('Guarde esta senha agora: ela não aparece de novo.');
  });

  it('redefine um acesso perdido', async () => {
    const { api, pedidas } = apiEmMemoria();
    render(<App api={api} />);
    await abrirConfiguracoes();
    const acesso = await secao('Redefinir um acesso');
    fireEvent.change(campo(acesso, 'Usuário da conta'), { target: { value: 'bruno' } });
    fireEvent.click(within(acesso).getByRole('button', { name: 'Redefinir o acesso' }));
    await vi.waitFor(async () =>
      expect((await andamento()).textContent).toContain('Acesso de bruno redefinido'),
    );
    expect(pedidas.at(-1)).toEqual({
      tarefa: 'conta-redefinir',
      campos: {
        ambiente: 'producao',
        endereco: 'grafite.empresa.com.br',
        usuario: 'bruno',
        doisPassos: 'não',
      },
    });
  });
});
