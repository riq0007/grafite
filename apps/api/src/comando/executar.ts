// O comando no servidor (`pnpm grafite`), para quem opera o servidor: lê os argumentos, executa e
// devolve o código de saída. O banco só é aberto quando o comando precisa dele.
import { parseArgs } from 'node:util';
import type { Banco } from '@grafite/db';
import { lerFaixas } from '@grafite/domain';
import { novoTokenDoColetor } from '../coleta/coletores.ts';
import { CHAVE_DE_32_BYTES } from '../config.ts';
import { trocarChaveDoCofre } from './cofre.ts';
import { criarColetorPeloComando } from './coletor.ts';
import { criarConta, redefinirAcesso } from './conta.ts';
import { testarEmail } from './email.ts';
import { ErroDoComando } from './erros.ts';
import {
  acrescentarEndereco,
  criarOrganizacao,
  enderecoValido,
  tirarEndereco,
  usuarioValido,
} from './organizacao.ts';

export interface AmbienteDoComando {
  banco: () => Banco;
  agora: () => Date;
  escrever: (texto: string) => void;
  escreverErro: (texto: string) => void;
  /** Uma variável do ambiente, como o token do coletor; sem ela, nenhuma. */
  variavel?: (nome: string) => string | undefined;
}

export const AJUDA = `Uso: pnpm grafite <comando> [opções]

Comandos:
  organizacao criar   Cria uma organização, com os endereços de acesso, o perfil Administrador
                      e a primeira conta, que recebe o Administrador.
    --nome <nome>               Nome da organização.
    --endereco <endereço>       Endereço de acesso, como grafite.empresa.local; repita para mais de um.
    --pessoa <nome>             Nome da pessoa da primeira conta.
    --usuario <usuário>         Usuário da primeira conta.
    --email <e-mail>            E-mail da pessoa (opcional).
    --sem-exigir-dois-passos    Nem a conta nem o Administrador exigem a verificação em dois
                                passos (só no desenvolvimento).
    --se-nao-existir            Não faz nada se o primeiro endereço já estiver registrado.

  organizacao acrescentar-endereco
                      Acrescenta um endereço de acesso à organização de um endereço dela.
    --endereco <endereço>       Um endereço de acesso da organização.
    --novo <endereço>           O endereço que ela passa a ter.

  organizacao tirar-endereco
                      Tira um endereço de acesso da organização; o último fica.
    --endereco <endereço>       O endereço que sai.

  conta criar         Cria uma pessoa e a conta dela numa organização, com senha temporária.
    --endereco <endereço>       Um endereço de acesso da organização.
    --pessoa <nome>             Nome da pessoa.
    --usuario <usuário>         Usuário da conta.
    --email <e-mail>            E-mail da pessoa (opcional).
    --exigir-dois-passos        Exige a verificação em dois passos na primeira entrada.
    --administrador             Dá à conta o perfil Administrador, para a organização inteira.

  conta redefinir     Recupera um acesso perdido: senha temporária nova, todas as sessões
                      encerradas e a contagem de tentativas zerada.
    --endereco <endereço>       Um endereço de acesso da organização.
    --usuario <usuário>         Usuário da conta.
    --remover-dois-passos       Remove também a verificação em dois passos, para um novo cadastro.

  coletor criar       Cria um coletor numa organização, com as faixas de rede que ele alcança.
    --endereco <endereço>       Um endereço de acesso da organização.
    --nome <nome>               Nome do coletor.
    --faixa <faixa>             Faixa de rede, como 10.0.0.0/24; repita para mais de uma.
    --token-do-ambiente         Liga o token de GRAFITE_COLETOR_TOKEN, sem mostrá-lo, em vez de
                                gerar um novo.
    --se-nao-existir            Não faz nada se a organização já tiver um coletor com esse token.

  cofre trocar-chave  Passa para a chave mestra nova, em todas as organizações, a chave de cada
                      segredo que ainda está na anterior, sem decifrar os valores. Lê as duas
                      chaves de GRAFITE_CHAVE_DO_COFRE (a nova) e GRAFITE_CHAVE_DO_COFRE_ANTERIOR.
                      Rodado de novo, não muda nada; o segredo que não abre com nenhuma das duas
                      fica como está e é listado.

  email testar        Manda um e-mail de teste pela configuração do e-mail do servidor
                      (GRAFITE_SMTP_URL e GRAFITE_EMAIL_REMETENTE) e diz o que o servidor de
                      e-mail respondeu, sem mostrar a senha. Não abre o banco.
    --para <e-mail>             Para quem vai o e-mail de teste.

A conexão com o banco vem de GRAFITE_DATABASE_URL (papel grafite_app).`;

const OPCOES = {
  ajuda: { type: 'boolean', short: 'h' },
  nome: { type: 'string' },
  endereco: { type: 'string', multiple: true },
  pessoa: { type: 'string' },
  usuario: { type: 'string' },
  email: { type: 'string' },
  'sem-exigir-dois-passos': { type: 'boolean' },
  'se-nao-existir': { type: 'boolean' },
  'exigir-dois-passos': { type: 'boolean' },
  'remover-dois-passos': { type: 'boolean' },
  administrador: { type: 'boolean' },
  faixa: { type: 'string', multiple: true },
  'token-do-ambiente': { type: 'boolean' },
  para: { type: 'string' },
  novo: { type: 'string' },
} as const;

function obrigatoria(valor: string | undefined, opcao: string): string {
  const preenchido = valor?.trim();
  if (!preenchido) throw new ErroDoComando(2, `Falta a opção --${opcao}.`);
  return preenchido;
}

function lerArgumentos(argumentos: string[]) {
  try {
    return parseArgs({ args: argumentos, options: OPCOES, allowPositionals: true, strict: true });
  } catch (erro) {
    throw new ErroDoComando(2, `${(erro as Error).message}\n\n${AJUDA}`);
  }
}

async function organizacaoCriar(
  { values }: ReturnType<typeof lerArgumentos>,
  ambiente: AmbienteDoComando,
) {
  const nome = obrigatoria(values.nome, 'nome');
  const enderecos = (values.endereco ?? []).map(enderecoValido);
  if (enderecos.length === 0) throw new ErroDoComando(2, 'Falta a opção --endereco.');
  const pessoa = obrigatoria(values.pessoa, 'pessoa');
  const usuario = usuarioValido(obrigatoria(values.usuario, 'usuario'));
  const exigirDoisPassos = !values['sem-exigir-dois-passos'];
  const resultado = await criarOrganizacao(ambiente.banco(), ambiente.agora, {
    nome,
    enderecos,
    pessoa,
    usuario,
    email: values.email?.trim() || undefined,
    exigirDoisPassos,
    seNaoExistir: values['se-nao-existir'] ?? false,
  });
  if (resultado.tipo === 'ja-existe') {
    ambiente.escrever(
      `A organização do endereço ${resultado.endereco} já existe; nada foi criado.`,
    );
    return;
  }
  const lista = enderecos.join(', ');
  ambiente.escrever(
    `Organização "${nome}" criada, com ${enderecos.length > 1 ? 'os endereços' : 'o endereço'} ${lista}.`,
  );
  ambiente.escrever(`Primeira conta: ${usuario} (${pessoa}), com o perfil Administrador.`);
  avisarSenha(
    ambiente,
    resultado.senhaTemporaria,
    exigirDoisPassos
      ? 'Na primeira entrada, a conta troca a senha e cadastra a verificação em dois passos.'
      : 'Na primeira entrada, a conta troca a senha.',
  );
}

async function organizacaoAcrescentarEndereco(
  { values }: ReturnType<typeof lerArgumentos>,
  ambiente: AmbienteDoComando,
) {
  const endereco = enderecoValido(obrigatoria(values.endereco?.[0], 'endereco'));
  const novo = enderecoValido(obrigatoria(values.novo, 'novo'));
  const resultado = await acrescentarEndereco(ambiente.banco(), ambiente.agora, {
    endereco,
    novo,
  });
  ambiente.escrever(
    resultado.tipo === 'ja-era'
      ? `O endereço ${novo} já é da organização "${resultado.organizacao}"; nada mudou.`
      : `Endereço ${novo} acrescentado à organização "${resultado.organizacao}".`,
  );
}

async function organizacaoTirarEndereco(
  { values }: ReturnType<typeof lerArgumentos>,
  ambiente: AmbienteDoComando,
) {
  const endereco = enderecoValido(obrigatoria(values.endereco?.[0], 'endereco'));
  const { organizacao } = await tirarEndereco(ambiente.banco(), ambiente.agora, { endereco });
  ambiente.escrever(`Endereço ${endereco} tirado da organização "${organizacao}".`);
}

function avisarSenha(ambiente: AmbienteDoComando, senha: string, depois: string) {
  ambiente.escrever(`Senha temporária: ${senha}`);
  ambiente.escrever(`Guarde esta senha agora: ela não aparece de novo. ${depois}`);
}

async function contaCriar(
  { values }: ReturnType<typeof lerArgumentos>,
  ambiente: AmbienteDoComando,
) {
  const endereco = enderecoValido(obrigatoria(values.endereco?.[0], 'endereco'));
  const pessoa = obrigatoria(values.pessoa, 'pessoa');
  const usuario = usuarioValido(obrigatoria(values.usuario, 'usuario'));
  const exigirDoisPassos = values['exigir-dois-passos'] ?? false;
  const administrador = values.administrador ?? false;
  const { senhaTemporaria } = await criarConta(ambiente.banco(), ambiente.agora, {
    endereco,
    pessoa,
    usuario,
    email: values.email?.trim() || undefined,
    exigirDoisPassos,
    administrador,
  });
  ambiente.escrever(
    `Conta ${usuario} (${pessoa}) criada na organização do endereço ${endereco}${
      administrador ? ', com o perfil Administrador' : ''
    }.`,
  );
  avisarSenha(
    ambiente,
    senhaTemporaria,
    exigirDoisPassos
      ? 'Na primeira entrada, a conta troca a senha e cadastra a verificação em dois passos.'
      : 'Na primeira entrada, a conta troca a senha.',
  );
}

const sessoesEncerradas = (quantas: number) =>
  quantas === 0
    ? 'nenhuma sessão estava aberta'
    : `${quantas} ${quantas === 1 ? 'sessão encerrada' : 'sessões encerradas'}`;

async function contaRedefinir(
  { values }: ReturnType<typeof lerArgumentos>,
  ambiente: AmbienteDoComando,
) {
  const endereco = enderecoValido(obrigatoria(values.endereco?.[0], 'endereco'));
  const usuario = usuarioValido(obrigatoria(values.usuario, 'usuario'));
  const resultado = await redefinirAcesso(ambiente.banco(), ambiente.agora, {
    endereco,
    usuario,
    removerDoisPassos: values['remover-dois-passos'] ?? false,
  });
  ambiente.escrever(
    `Acesso de ${usuario} redefinido: ${sessoesEncerradas(resultado.sessoesEncerradas)}.`,
  );
  if (resultado.doisPassosRemovidos) {
    ambiente.escrever('A verificação em dois passos foi removida.');
  }
  avisarSenha(
    ambiente,
    resultado.senhaTemporaria,
    resultado.exigeDoisPassos && resultado.doisPassosRemovidos
      ? 'Na próxima entrada, a conta troca a senha e cadastra a verificação em dois passos de novo.'
      : 'Na próxima entrada, a conta troca a senha.',
  );
}

async function coletorCriar(
  { values }: ReturnType<typeof lerArgumentos>,
  ambiente: AmbienteDoComando,
) {
  const endereco = enderecoValido(obrigatoria(values.endereco?.[0], 'endereco'));
  const nome = obrigatoria(values.nome, 'nome');
  if (nome.length > 60) throw new ErroDoComando(2, '--nome: use até 60 caracteres.');
  const faixas = lerFaixas(values.faixa ?? []);
  if (!faixas.ok) throw new ErroDoComando(2, `--faixa: ${faixas.erro}`);
  const doAmbiente = values['token-do-ambiente'] ?? false;
  const token = doAmbiente
    ? ambiente.variavel?.('GRAFITE_COLETOR_TOKEN')?.trim()
    : novoTokenDoColetor();
  if (!token || token.length < 32) {
    throw new ErroDoComando(
      2,
      'GRAFITE_COLETOR_TOKEN: obrigatório com --token-do-ambiente, com pelo menos 32 caracteres.',
    );
  }
  const resultado = await criarColetorPeloComando(ambiente.banco(), ambiente.agora, {
    endereco,
    nome,
    faixas: faixas.faixas,
    token,
    seNaoExistir: values['se-nao-existir'] ?? false,
  });
  if (resultado.tipo === 'ja-existe') {
    ambiente.escrever(
      `O coletor "${resultado.nome}" já existe nesta organização; nada foi criado.`,
    );
    return;
  }
  ambiente.escrever(`Coletor "${nome}" criado na organização do endereço ${endereco}.`);
  if (doAmbiente) {
    ambiente.escrever('O token é o de GRAFITE_COLETOR_TOKEN, na configuração do coletor.');
  } else {
    ambiente.escrever(`Token do coletor: ${token}`);
    ambiente.escrever(
      'Guarde este token agora: ele não aparece de novo. Ponha-o em GRAFITE_COLETOR_TOKEN, na configuração do coletor.',
    );
  }
  if (faixas.faixas.length === 0) {
    ambiente.escrever(
      'Sem faixas, o coletor não coleta: cadastre as faixas na tela dos coletores.',
    );
  }
}

/** A chave do ambiente, conferida como na partida da API, sem nunca mostrá-la. */
function chaveDoAmbiente(ambiente: AmbienteDoComando, nome: string, falta: string): Buffer {
  const texto = ambiente.variavel?.(nome)?.trim();
  if (!texto) throw new ErroDoComando(2, `${nome}: obrigatória na troca (${falta}).`);
  if (!CHAVE_DE_32_BYTES.test(texto)) {
    throw new ErroDoComando(2, `${nome}: deve ter 32 bytes em base64.`);
  }
  return Buffer.from(texto, 'base64');
}

const segredos = (quantos: number) =>
  quantos === 1
    ? '1 segredo passou para a chave nova'
    : `${quantos} segredos passaram para a chave nova`;

async function cofreTrocarChave(
  _lidos: ReturnType<typeof lerArgumentos>,
  ambiente: AmbienteDoComando,
) {
  const atual = chaveDoAmbiente(ambiente, 'GRAFITE_CHAVE_DO_COFRE', 'a chave nova do cofre');
  const anterior = chaveDoAmbiente(
    ambiente,
    'GRAFITE_CHAVE_DO_COFRE_ANTERIOR',
    'a chave que cifrou os segredos até agora',
  );
  if (atual.equals(anterior)) {
    throw new ErroDoComando(
      2,
      'GRAFITE_CHAVE_DO_COFRE_ANTERIOR: deve ser diferente de GRAFITE_CHAVE_DO_COFRE.',
    );
  }
  const resultados = await trocarChaveDoCofre(ambiente.banco(), ambiente.agora, {
    atual,
    anterior,
  });
  for (const { organizacao, recifrados, naoAbrem } of resultados) {
    if (recifrados > 0) ambiente.escrever(`Organização "${organizacao}": ${segredos(recifrados)}.`);
    for (const { id, nome } of naoAbrem) {
      ambiente.escrever(
        `Organização "${organizacao}": o segredo "${nome}" (${id}) não abre com nenhuma das duas chaves e ficou como estava.`,
      );
    }
  }
  if (resultados.every(({ recifrados }) => recifrados === 0)) {
    ambiente.escrever('Nenhum segredo estava na chave anterior; nada mudou.');
  }
}

async function emailTestar(
  { values }: ReturnType<typeof lerArgumentos>,
  ambiente: AmbienteDoComando,
) {
  const para = obrigatoria(values.para, 'para');
  ambiente.escrever(await testarEmail((nome) => ambiente.variavel?.(nome), para));
}

/** Executa o comando e devolve o código de saída: 0 deu certo, 1 foi recusado e 2 é uso errado. */
export async function executarComando(
  argumentos: string[],
  ambiente: AmbienteDoComando,
): Promise<number> {
  try {
    const lidos = lerArgumentos(argumentos);
    const [comando, acao] = lidos.positionals;
    if (lidos.values.ajuda) {
      ambiente.escrever(AJUDA);
      return 0;
    }
    const executores: Record<string, typeof organizacaoCriar> = {
      'organizacao criar': organizacaoCriar,
      'organizacao acrescentar-endereco': organizacaoAcrescentarEndereco,
      'organizacao tirar-endereco': organizacaoTirarEndereco,
      'conta criar': contaCriar,
      'conta redefinir': contaRedefinir,
      'coletor criar': coletorCriar,
      'cofre trocar-chave': cofreTrocarChave,
      'email testar': emailTestar,
    };
    const executor = executores[`${comando} ${acao}`];
    if (executor) {
      await executor(lidos, ambiente);
      return 0;
    }
    throw new ErroDoComando(2, AJUDA);
  } catch (erro) {
    if (!(erro instanceof ErroDoComando)) throw erro;
    ambiente.escreverErro(erro.message);
    return erro.codigoDeSaida;
  }
}
