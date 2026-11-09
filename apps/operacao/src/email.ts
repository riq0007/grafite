// O e-mail da produção pelo comando de operação (spec operacao-servicos, "E-mail configurado pelo
// comando de operação"; change p3c-email-e-push, design, decisão 10): `email configurar` confere o
// SMTP e o remetente antes de gravar, pede a senha sem eco quando o endereço traz só o usuário,
// grava na configuração da produção, com o acesso restrito, e reinicia o app com saúde; `email
// testar` manda o e-mail de teste pelo comando da API da produção. O teste nunca recebe o e-mail, e
// a senha nunca aparece na tela, no log nem na linha de comando. O fluxo é das duas plataformas
// (change servidor-linux-com-docker, design, decisão 1), com a peça da plataforma.
import { writeFile } from 'node:fs/promises';
import { conferirEnderecoDoSmtp, conferirRemetente } from '@grafite/domain';
import type { ExecutarProcesso } from '@grafite/operacao';
import { gerarConfigEnv, lerConfigEnv } from './configuracao.ts';
import { comServicosParados, vejaNoRunbook } from './falhas.ts';
import { lerInstalacao } from './instalacao.ts';
import { NO_SERVIDOR, PORTAS, SERVICOS } from './layout.ts';
import type { PlataformaDaInstalacao } from './plataforma.ts';
import { conferirSaude, type Saude } from './saude.ts';
import type { Console } from './windows/console.ts';
import type { Servicos } from './windows/servicos.ts';

export interface DependenciasDoEmail {
  raiz: string;
  console: Console;
  executar: ExecutarProcesso;
  servicos: Servicos;
  saude: Saude;
  /** As peças da plataforma: o acesso à configuração e o comando da API da produção. */
  plataforma: PlataformaDaInstalacao;
}

export async function configurarEmail(
  dep: DependenciasDoEmail,
  pedido: { smtp: string; remetente: string },
): Promise<void> {
  const smtp = pedido.smtp.trim();
  const remetente = pedido.remetente.trim();
  const motivoDoSmtp = conferirEnderecoDoSmtp(smtp);
  if (motivoDoSmtp !== null) throw new Error(`--smtp: ${motivoDoSmtp}.`);
  const motivoDoRemetente = conferirRemetente(remetente);
  if (motivoDoRemetente !== null) throw new Error(`--remetente: ${motivoDoRemetente}.`);

  // A senha fora da linha de comando: pedida sem eco quando o endereço traz só o usuário.
  const endereco = new URL(smtp);
  if (endereco.username !== '' && endereco.password === '') {
    endereco.password = await dep.console.perguntarSegredo('Senha do SMTP');
  }

  const { plataforma } = dep;
  const { estado, pastas } = await lerInstalacao(dep.raiz, plataforma.nome);
  const caminho = pastas.producao.configEnv;
  const variaveis = await lerConfigEnv(caminho);
  await writeFile(
    caminho,
    gerarConfigEnv({
      ...variaveis,
      GRAFITE_SMTP_URL: endereco.href,
      GRAFITE_EMAIL_REMETENTE: remetente,
    }),
  );
  await plataforma.restringirAcesso(caminho);

  await comServicosParados(
    dep.servicos,
    [SERVICOS.coletor, SERVICOS.producao],
    `O app e o coletor da produção ficaram parados. ${vejaNoRunbook('E-mail e push', plataforma.nome)}`,
    async () => {
      await dep.servicos.iniciar(SERVICOS.producao);
      conferirSaude(
        await dep.saude.local(PORTAS.producao),
        { versao: estado.ambientes.producao.atual ?? '', ambiente: 'producao' },
        'O app da produção',
      );
      await dep.servicos.iniciar(SERVICOS.coletor);
    },
  );
  dep.console.escrever(
    `O e-mail da produção está configurado, e o app reiniciou com saúde. Confira o envio com ${NO_SERVIDOR[plataforma.nome].comando} email testar --para <e-mail>.`,
  );
}

export async function testarEmail(dep: DependenciasDoEmail, para: string): Promise<void> {
  const instalacao = await lerInstalacao(dep.raiz, dep.plataforma.nome);
  const { codigo, saida, erro } = await dep.plataforma
    .scriptsDoAmbiente(instalacao, 'producao')
    .comandoDaApi(await lerConfigEnv(instalacao.pastas.producao.configEnv), [
      'email',
      'testar',
      '--para',
      para,
    ]);
  if (codigo !== 0) throw new Error((erro || saida).trim());
  dep.console.escrever(saida.trim());
}
