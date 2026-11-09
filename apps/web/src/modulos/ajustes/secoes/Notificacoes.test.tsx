import type { components } from '@grafite/api-client';
import { filaDeAvisos } from '@grafite/ui';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProvedorDoAmbienteDoPush } from '../../../notificacoes/ambienteDoPush.tsx';
import type { AmbienteDoPush } from '../../../notificacoes/push.ts';
import type { AlvoDasPreferencias } from '../../../preferencias/alvo.tsx';
import { ProvedorDoAlvo } from '../../../preferencias/alvo.tsx';
import { ProvedorDePreferencias } from '../../../preferencias/usePreferencias.tsx';
import { alvoSimulado } from '../../../teste/alvo.ts';
import { preferenciasDaCopia } from '../../../teste/preferencias.ts';
import { comApi } from '../../../teste/provedores.tsx';
import type { ServidorDeTeste } from '../../../teste/sessao.ts';
import { SecaoNotificacoes } from './Notificacoes.tsx';

const raiz = () => document.documentElement;
const salvas = preferenciasDaCopia;

afterEach(() => {
  cleanup();
  localStorage.clear();
  for (const nome of [...raiz().getAttributeNames()]) raiz().removeAttribute(nome);
  raiz().removeAttribute('style');
  for (const { chave } of filaDeAvisos.naTela) filaDeAvisos.fechar(chave);
});

type Canais = components['schemas']['CanaisDaConta'];

const CHAVE_PUBLICA = `B${'A'.repeat(86)}`;
const DESTE = 'https://fcm.googleapis.com/fcm/send/este';

const CANAIS: Canais = {
  email: { situacao: 'ligado', endereco: 'ana.souza@empresa.com.br' },
  push: { situacao: 'ligado', chavePublica: CHAVE_PUBLICA, aparelhos: [] },
};

const aparelho = (dados: Partial<Canais['push']['aparelhos'][number]> = {}) => ({
  id: '0199d3a0-0000-7000-8000-0000000000f1',
  aparelho: 'Chrome no Android',
  endpoint: DESTE,
  criadaEm: '2026-10-14T13:00:00.000Z',
  ultimoEnvioEm: null,
  ...dados,
});

/** Um navegador com push, ainda sem permissão, cuja inscrição aponta para DESTE. */
function navegadorComPush({
  permissao = 'default' as NotificationPermission,
  responde = 'granted' as NotificationPermission,
  inscrito = false,
} = {}): AmbienteDoPush & { cancelou: () => boolean } {
  let atual = permissao;
  let temInscricao = inscrito;
  let cancelou = false;
  return {
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    temPush: true,
    instalado: false,
    permissao: () => atual,
    pedirPermissao: async () => {
      atual = responde;
      return responde;
    },
    registro: async () => ({
      pushManager: {
        subscribe: async () => {
          temInscricao = true;
          return {
            endpoint: DESTE,
            toJSON: () => ({
              endpoint: DESTE,
              keys: { p256dh: `B${'C'.repeat(86)}`, auth: 'D'.repeat(22) },
            }),
          };
        },
        getSubscription: async () =>
          temInscricao
            ? {
                endpoint: DESTE,
                unsubscribe: async () => {
                  cancelou = true;
                  temInscricao = false;
                  return true;
                },
              }
            : null,
      },
    }),
    cancelou: () => cancelou,
  };
}

function abrir(
  alvo?: AlvoDasPreferencias,
  {
    canais = CANAIS,
    servidor = {},
    ambiente,
  }: { canais?: Canais; servidor?: ServidorDeTeste; ambiente?: AmbienteDoPush } = {},
) {
  const Provedores = comApi({
    'GET /api/conta/canais': () => Response.json(canais),
    ...servidor,
  });
  const secao = (
    <ProvedorDePreferencias>
      <ProvedorDoAlvo alvo={alvo}>
        <SecaoNotificacoes />
      </ProvedorDoAlvo>
    </ProvedorDePreferencias>
  );
  render(
    <Provedores>
      {ambiente ? (
        <ProvedorDoAmbienteDoPush ambiente={ambiente}>{secao}</ProvedorDoAmbienteDoPush>
      ) : (
        secao
      )}
    </Provedores>,
  );
}

const avisosNaTela = () => screen.getByRole('group', { name: 'Avisos na tela' });
const severidade = (nome: string) =>
  within(avisosNaTela()).getByRole('checkbox', { name: nome }) as HTMLInputElement;
const tempo = (nome: string) =>
  within(screen.getByRole('radiogroup', { name: 'Tempo do aviso' })).getByRole('radio', {
    name: nome,
  }) as HTMLInputElement;

describe('seção Notificações', () => {
  it('abre com os padrões de fábrica: as três severidades viram aviso, por 6 s', () => {
    abrir();
    expect(severidade('Crítico').checked).toBe(true);
    expect(severidade('Atenção').checked).toBe(true);
    expect(severidade('Informação').checked).toBe(true);
    expect(tempo('6 s').checked).toBe(true);
  });

  it('o Crítico fica ligado e sem como desligar, com a explicação', () => {
    abrir();
    expect(severidade('Crítico').disabled).toBe(true);
    const ids = avisosNaTela().getAttribute('aria-describedby')?.split(' ') ?? [];
    const descricao = ids.map((id) => document.getElementById(id)?.textContent).join(' ');
    expect(descricao).toContain('O Crítico sempre aparece, até ser reconhecido ou adiado.');
  });

  it('diz que o que não vira aviso continua na central', () => {
    abrir();
    expect(
      screen.getByText(/O que não aparece como aviso continua na central de notificações\./),
    ).toBeTruthy();
  });

  it('desligar Atenção e Informação vale na hora e fica gravado', () => {
    abrir();
    fireEvent.click(severidade('Atenção'));
    fireEvent.click(severidade('Informação'));
    expect(salvas().notificacoes).toMatchObject({ atencao: false, informacao: false });
    expect(severidade('Crítico').checked).toBe(true);
  });

  it('o tempo do aviso é 6, 10 ou 20 s, gravado na hora', () => {
    abrir();
    const grupo = screen.getByRole('radiogroup', { name: 'Tempo do aviso' });
    expect(
      within(grupo)
        .getAllByRole('radio')
        .map((opcao) => opcao.closest('label')?.textContent),
    ).toEqual(['6 s', '10 s', '20 s']);
    fireEvent.click(tempo('10 s'));
    expect(salvas().notificacoes.tempo).toBe(10);
  });

  it('"Mostrar aviso de exemplo" mostra um aviso marcado como exemplo, com o tempo escolhido, fora da central', () => {
    abrir();
    fireEvent.click(tempo('10 s'));
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aviso de exemplo' }));
    const [exemplo] = filaDeAvisos.naTela;
    expect(exemplo?.aviso).toMatchObject({
      situacao: 'info',
      titulo: 'Aviso de exemplo',
      descricao: 'Some em 10 s, como os avisos de Atenção e de Informação.',
    });
    expect(exemplo?.duracao).toBe(10_000);
  });

  it('o aviso de exemplo aparece mesmo com os avisos de Informação desligados', () => {
    abrir();
    fireEvent.click(severidade('Informação'));
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aviso de exemplo' }));
    expect(filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo)).toEqual(['Aviso de exemplo']);
  });

  it('cada ajuste tem o controle marcado para o foco pelo endereço', () => {
    abrir();
    const marcados = [...document.querySelectorAll('[data-foco]')];
    expect(marcados.map((el) => el.getAttribute('data-foco'))).toEqual([
      'avisos-na-tela',
      'tempo-do-aviso',
      'modo-foco',
      'email-do-critico',
      'resumo-por-email',
      'avisos-no-celular',
    ]);
  });

  it('o modo Foco liga e desliga, com a explicação, e vai para as preferências', () => {
    abrir();
    expect(
      screen.getByText('Com o Foco ligado, só o Crítico vira aviso. O resto vai para a central.'),
    ).toBeTruthy();
    const foco = screen.getByRole('switch', { name: /Modo Foco/ }) as HTMLInputElement;
    expect(foco.checked).toBe(false);
    fireEvent.click(foco);
    expect(salvas().notificacoes.foco).toBe(true);
  });

  it('Restaurar padrões volta as notificações à fábrica, sem mexer no cursor', () => {
    localStorage.setItem(
      'grafite.preferencias',
      JSON.stringify({
        versao: 1,
        cursor: { tipo: 'sistema' },
        notificacoes: { atencao: false, informacao: false, tempo: 20 },
      }),
    );
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(salvas().notificacoes).toEqual({
      atencao: true,
      informacao: true,
      tempo: 6,
      foco: false,
      emailCritico: true,
      resumo: 'diario',
      pushCritico: true,
      pushAtencao: false,
      pushInformacao: false,
    });
    expect(salvas().cursor.tipo).toBe('sistema');
    expect(tempo('6 s').checked).toBe(true);
  });
});

describe('seção Notificações com outro alvo', () => {
  it('mostra e muda o alvo, e o aviso de exemplo usa o tempo do alvo', () => {
    const alvo = alvoSimulado({ notificacoes: { informacao: false, tempo: 20 } });
    abrir(alvo);
    expect(severidade('Informação').checked).toBe(false);
    expect(tempo('20 s').checked).toBe(true);
    fireEvent.click(tempo('10 s'));
    expect(alvo.mudar).toHaveBeenCalledWith('notificacoes', { tempo: 10 });
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aviso de exemplo' }));
    const [exemplo] = filaDeAvisos.naTela;
    expect(exemplo?.aviso.descricao).toBe(
      'Some em 20 s, como os avisos de Atenção e de Informação.',
    );
    expect(exemplo?.duracao).toBe(20_000);
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(alvo.restaurar).toHaveBeenCalledWith('notificacoes');
  });
});

const porEmail = () => screen.getByRole('group', { name: 'Por e-mail' });
const noCelular = () => screen.getByRole('group', { name: 'No celular' });

describe('seção Notificações: por e-mail', () => {
  it('diz para qual e-mail as notificações vão, com o crítico na hora e o resumo diário', async () => {
    abrir();
    expect(
      await within(porEmail()).findByText('As notificações vão para ana.souza@empresa.com.br.'),
    ).toBeTruthy();
    const critico = within(porEmail()).getByRole('switch', {
      name: /Crítico na hora/,
    }) as HTMLInputElement;
    expect(critico.checked).toBe(true);
    const diario = within(porEmail()).getByRole('radio', { name: 'Diário, às 8h' });
    expect((diario as HTMLInputElement).checked).toBe(true);
  });

  it('desligar o crítico na hora e o resumo vale na hora e fica gravado', async () => {
    abrir();
    await within(porEmail()).findByText(/ana\.souza@empresa\.com\.br/);
    fireEvent.click(within(porEmail()).getByRole('switch', { name: /Crítico na hora/ }));
    fireEvent.click(within(porEmail()).getByRole('radio', { name: 'Desligado' }));
    expect(salvas().notificacoes).toMatchObject({ emailCritico: false, resumo: 'desligado' });
  });

  it('a pessoa sem e-mail vê o motivo, com os ajustes do e-mail desligados', async () => {
    abrir(undefined, {
      canais: { ...CANAIS, email: { situacao: 'sem-email', endereco: null } },
    });
    expect(
      await within(porEmail()).findByText(
        'A pessoa da sua conta não tem e-mail. Peça à administração para cadastrar o seu e-mail.',
      ),
    ).toBeTruthy();
    expect(
      (within(porEmail()).getByRole('switch', { name: /Crítico na hora/ }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(
      within(porEmail()).queryByRole('button', { name: 'Mandar um e-mail de teste' }),
    ).toBeNull();
  });

  it('o servidor sem os canais diz isso nos dois grupos', async () => {
    abrir(undefined, {
      canais: {
        email: { situacao: 'sem-configuracao', endereco: 'ana.souza@empresa.com.br' },
        push: { situacao: 'sem-configuracao', chavePublica: null, aparelhos: [] },
      },
    });
    expect(
      await within(porEmail()).findByText('O envio de e-mail não está configurado neste servidor.'),
    ).toBeTruthy();
    expect(
      within(noCelular()).getByText('Os avisos no celular não estão configurados neste servidor.'),
    ).toBeTruthy();
  });

  it('o ambiente de teste diz que não envia', async () => {
    abrir(undefined, {
      canais: {
        email: { situacao: 'ambiente-de-teste', endereco: 'ana.souza@empresa.com.br' },
        push: { situacao: 'ambiente-de-teste', chavePublica: null, aparelhos: [] },
      },
    });
    expect(
      await within(porEmail()).findByText(
        'O ambiente de teste não envia e-mail nem avisos no celular.',
      ),
    ).toBeTruthy();
    expect(
      within(noCelular()).getByText('O ambiente de teste não envia e-mail nem avisos no celular.'),
    ).toBeTruthy();
  });

  it('manda o e-mail de teste e diz para qual e-mail foi', async () => {
    const pedidos: string[] = [];
    abrir(undefined, {
      servidor: {
        'POST /api/conta/canais/email/teste': () => {
          pedidos.push('teste');
          return Response.json({ endereco: 'ana.souza@empresa.com.br' });
        },
      },
    });
    fireEvent.click(
      await within(porEmail()).findByRole('button', { name: 'Mandar um e-mail de teste' }),
    );
    await waitFor(() =>
      expect(filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo)).toContain(
        'E-mail de teste enviado para ana.souza@empresa.com.br.',
      ),
    );
    expect(pedidos).toEqual(['teste']);
  });
});

describe('seção Notificações: no celular', () => {
  it('as severidades valem para todos os aparelhos, com o Foco explicado', async () => {
    abrir();
    await within(noCelular()).findByText('Este navegador não recebe avisos fora da aplicação.');
    const severidades = within(noCelular()).getByRole('group', { name: 'Severidades no celular' });
    const marcada = (nome: string) =>
      (within(severidades).getByRole('checkbox', { name: nome }) as HTMLInputElement).checked;
    expect([marcada('Crítico'), marcada('Atenção'), marcada('Informação')]).toEqual([
      true,
      false,
      false,
    ]);
    expect(
      within(noCelular()).getByText(/Com o Foco ligado, só o Crítico vai para o celular\./),
    ).toBeTruthy();
    fireEvent.click(within(severidades).getByRole('checkbox', { name: 'Atenção' }));
    expect(salvas().notificacoes.pushAtencao).toBe(true);
  });

  it('o navegador sem push diz isso, sem "Receber neste aparelho"', async () => {
    abrir(undefined, { ambiente: { ...navegadorComPush(), temPush: false } });
    expect(
      await within(noCelular()).findByText('Este navegador não recebe avisos fora da aplicação.'),
    ).toBeTruthy();
    expect(
      within(noCelular()).queryByRole('button', { name: 'Receber neste aparelho' }),
    ).toBeNull();
  });

  it('recebe neste aparelho: pede a permissão, inscreve e mostra "Este aparelho"', async () => {
    let canais = CANAIS;
    const inscricoes: unknown[] = [];
    abrir(undefined, {
      ambiente: navegadorComPush(),
      servidor: {
        'GET /api/conta/canais': () => Response.json(canais),
        'POST /api/conta/push': async (pedido) => {
          inscricoes.push(await pedido.json());
          canais = { ...CANAIS, push: { ...CANAIS.push, aparelhos: [aparelho()] } };
          return Response.json(aparelho(), { status: 201 });
        },
      },
    });
    fireEvent.click(
      await within(noCelular()).findByRole('button', { name: 'Receber neste aparelho' }),
    );
    const lista = await within(noCelular()).findByRole('list', {
      name: 'Aparelhos que recebem os avisos',
    });
    expect(await within(lista).findByText('Este aparelho')).toBeTruthy();
    expect(within(lista).getByText('Chrome no Android')).toBeTruthy();
    expect(inscricoes).toEqual([
      {
        endpoint: DESTE,
        chaves: { p256dh: `B${'C'.repeat(86)}`, auth: 'D'.repeat(22) },
        aparelho: 'Chrome no Android',
      },
    ]);
    expect(
      within(noCelular()).getByRole('button', { name: 'Mandar um aviso de teste' }),
    ).toBeTruthy();
    expect(
      within(noCelular()).queryByRole('button', { name: 'Receber neste aparelho' }),
    ).toBeNull();
  });

  it('com os avisos bloqueados no navegador, explica como liberar e não inscreve', async () => {
    const gravar = vi.fn();
    abrir(undefined, {
      ambiente: navegadorComPush({ responde: 'denied' }),
      servidor: { 'POST /api/conta/push': gravar },
    });
    fireEvent.click(
      await within(noCelular()).findByRole('button', { name: 'Receber neste aparelho' }),
    );
    expect(
      await within(noCelular()).findByText(
        'Os avisos estão bloqueados neste navegador. Libere as notificações do Grafite nas configurações do site.',
      ),
    ).toBeTruthy();
    expect(gravar).not.toHaveBeenCalled();
  });

  it('tira este aparelho: some da lista e a inscrição sai do navegador', async () => {
    let canais: Canais = { ...CANAIS, push: { ...CANAIS.push, aparelhos: [aparelho()] } };
    const navegador = navegadorComPush({ permissao: 'granted', inscrito: true });
    const tirados: string[] = [];
    abrir(undefined, {
      ambiente: navegador,
      servidor: {
        'GET /api/conta/canais': () => Response.json(canais),
        [`DELETE /api/conta/push/${aparelho().id}`]: () => {
          tirados.push(aparelho().id);
          canais = CANAIS;
          return new Response(null, { status: 204 });
        },
      },
    });
    const lista = await within(noCelular()).findByRole('list', {
      name: 'Aparelhos que recebem os avisos',
    });
    fireEvent.click(await within(lista).findByRole('button', { name: /^Tirar/ }));
    await waitFor(() =>
      expect(
        within(noCelular()).queryByRole('list', { name: 'Aparelhos que recebem os avisos' }),
      ).toBeNull(),
    );
    expect(tirados).toEqual([aparelho().id]);
    expect(navegador.cancelou()).toBe(true);
  });

  it('manda o aviso de teste e diz quantos aparelhos receberam', async () => {
    abrir(undefined, {
      canais: { ...CANAIS, push: { ...CANAIS.push, aparelhos: [aparelho()] } },
      servidor: { 'POST /api/conta/canais/push/teste': () => Response.json({ aparelhos: 1 }) },
    });
    fireEvent.click(
      await within(noCelular()).findByRole('button', { name: 'Mandar um aviso de teste' }),
    );
    await waitFor(() =>
      expect(filaDeAvisos.naTela.map(({ aviso }) => aviso.titulo)).toContain(
        'Aviso de teste enviado para 1 aparelho.',
      ),
    );
  });
});

describe('seção Notificações com outro alvo: os canais', () => {
  it('mostra só as escolhas, sem o e-mail da pessoa nem os aparelhos', () => {
    const alvo = alvoSimulado({ notificacoes: { resumo: 'desligado' } });
    abrir(alvo);
    expect(
      (within(porEmail()).getByRole('radio', { name: 'Desligado' }) as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.click(within(porEmail()).getByRole('switch', { name: /Crítico na hora/ }));
    expect(alvo.mudar).toHaveBeenCalledWith('notificacoes', { emailCritico: false });
    expect(within(porEmail()).queryByText(/As notificações vão para/)).toBeNull();
    expect(
      within(noCelular()).queryByRole('button', { name: 'Receber neste aparelho' }),
    ).toBeNull();
  });
});
