// O segredo do cofre (spec cofre-de-segredos, "Segredo" e "Validade e rotação"; design do P6): os
// tipos e as classificações do PMG, com o código de lá para a migração do P8, a conferência dos
// campos e do valor, e a validade e a rotação pela data de hoje. Só o valor é secreto; o resto são
// dados do segredo, que a lista mostra a quem o vê.
import { lerData } from '../campos/datas.ts';

export const TIPOS_DE_SEGREDO = [
  { id: 'usuario-e-senha', rotulo: 'Usuário e senha', pmg: 'USER_PASSWORD' },
  { id: 'conta-administrativa', rotulo: 'Conta administrativa', pmg: 'ADMIN_ACCOUNT' },
  { id: 'banco-de-dados', rotulo: 'Banco de dados', pmg: 'DATABASE' },
  { id: 'conta-de-servico', rotulo: 'Conta de serviço', pmg: 'SERVICE_ACCOUNT' },
  { id: 'chave-de-api', rotulo: 'Chave de API', pmg: 'API_KEY' },
  { id: 'token', rotulo: 'Token', pmg: 'TOKEN' },
  { id: 'chave-ssh', rotulo: 'Chave SSH', pmg: 'SSH_KEY' },
  { id: 'certificado', rotulo: 'Certificado', pmg: 'CERTIFICATE' },
  { id: 'pin', rotulo: 'PIN', pmg: 'PIN' },
  { id: 'wi-fi', rotulo: 'Wi-Fi', pmg: 'WIFI' },
  { id: 'chave-de-licenca', rotulo: 'Chave de licença', pmg: null },
  // A comunidade com que o coletor lê as impressoras (change p2b-impressoras-por-snmp).
  { id: 'comunidade-snmp', rotulo: 'Comunidade SNMP', pmg: null },
  { id: 'outro', rotulo: 'Outro', pmg: 'OTHER' },
] as const;

export type TipoDeSegredo = (typeof TIPOS_DE_SEGREDO)[number]['id'];

export const ROTULOS_DOS_TIPOS_DE_SEGREDO = Object.fromEntries(
  TIPOS_DE_SEGREDO.map(({ id, rotulo }) => [id, rotulo]),
) as Record<TipoDeSegredo, string>;

export const CLASSIFICACOES_DE_SEGREDO = [
  { id: 'pessoal', rotulo: 'Pessoal', pmg: 'PERSONAL' },
  { id: 'compartilhado', rotulo: 'Compartilhado', pmg: 'SHARED' },
  { id: 'administrativo', rotulo: 'Administrativo', pmg: 'ADMINISTRATIVE' },
  { id: 'privilegiado', rotulo: 'Privilegiado', pmg: 'PRIVILEGED' },
  { id: 'aplicacao', rotulo: 'Aplicação', pmg: 'APPLICATION' },
  { id: 'equipamento', rotulo: 'Equipamento', pmg: 'EQUIPMENT' },
] as const;

export type ClassificacaoDeSegredo = (typeof CLASSIFICACOES_DE_SEGREDO)[number]['id'];

export const ROTULOS_DAS_CLASSIFICACOES_DE_SEGREDO = Object.fromEntries(
  CLASSIFICACOES_DE_SEGREDO.map(({ id, rotulo }) => [id, rotulo]),
) as Record<ClassificacaoDeSegredo, string>;

export const tipoDeSegredo = (id: unknown): id is TipoDeSegredo =>
  TIPOS_DE_SEGREDO.some((tipo) => tipo.id === id);

export const classificacaoDeSegredo = (id: unknown): id is ClassificacaoDeSegredo =>
  CLASSIFICACOES_DE_SEGREDO.some((classificacao) => classificacao.id === id);

/** Os limites dos campos do segredo, em caracteres. */
export const LIMITES_DO_SEGREDO = {
  nome: 120,
  identificador: 200,
  endereco: 500,
  notas: 2000,
  valor: 10_000,
} as const;

export interface DadosDoSegredo {
  nome: string;
  tipo: TipoDeSegredo;
  classificacao: ClassificacaoDeSegredo;
  identificador: string | null;
  endereco: string | null;
  notas: string | null;
  /** Em aaaa-mm-dd. */
  validade: string | null;
  /** Em aaaa-mm-dd. */
  proximaRotacao: string | null;
  /** O valor secreto; nulo na edição que não o troca. */
  valor: string | null;
}

export type CampoDoSegredo = keyof DadosDoSegredo;

export type ConferenciaDoSegredo =
  | { ok: true; dados: DadosDoSegredo }
  | { ok: false; erros: Partial<Record<CampoDoSegredo, string>> };

const ATE = (limite: number) => `Use até ${limite.toLocaleString('pt-BR')} caracteres.`;

/** O texto opcional sem os espaços das pontas; vazio vira nulo. */
function textoOpcional(entrada: unknown): string | null {
  if (typeof entrada !== 'string') return null;
  const texto = entrada.trim();
  return texto === '' ? null : texto;
}

/**
 * Confere os campos do segredo, como a API grava e a tela confere antes de enviar. O valor guarda
 * os espaços, que fazem parte de uma senha. Na edição (`valorObrigatorio` falso), o valor ausente
 * deixa o guardado como está, e o valor vazio é recusado.
 */
export function conferirSegredo(
  entrada: Record<string, unknown>,
  { valorObrigatorio }: { valorObrigatorio: boolean },
): ConferenciaDoSegredo {
  const erros: Partial<Record<CampoDoSegredo, string>> = {};
  const nome = typeof entrada.nome === 'string' ? entrada.nome.trim() : '';
  if (nome === '') erros.nome = 'Informe o nome do segredo.';
  else if (nome.length > LIMITES_DO_SEGREDO.nome) erros.nome = ATE(LIMITES_DO_SEGREDO.nome);
  if (!tipoDeSegredo(entrada.tipo)) erros.tipo = 'Escolha o tipo do segredo.';
  if (!classificacaoDeSegredo(entrada.classificacao)) {
    erros.classificacao = 'Escolha a classificação do segredo.';
  }
  const opcionais = {
    identificador: textoOpcional(entrada.identificador),
    endereco: textoOpcional(entrada.endereco),
    notas: textoOpcional(entrada.notas),
  };
  for (const campo of ['identificador', 'endereco', 'notas'] as const) {
    const texto = opcionais[campo];
    if (texto !== null && texto.length > LIMITES_DO_SEGREDO[campo]) {
      erros[campo] = ATE(LIMITES_DO_SEGREDO[campo]);
    }
  }
  const datas = {
    validade: lerData(entrada.validade),
    proximaRotacao: lerData(entrada.proximaRotacao),
  };
  for (const campo of ['validade', 'proximaRotacao'] as const) {
    const lida = datas[campo];
    if (!lida.ok) erros[campo] = lida.erro;
  }
  const valor = entrada.valor;
  if (valor === undefined || valor === null) {
    if (valorObrigatorio) erros.valor = 'Informe o valor do segredo.';
  } else if (typeof valor !== 'string' || valor === '') {
    erros.valor = 'Informe o valor do segredo.';
  } else if (valor.length > LIMITES_DO_SEGREDO.valor) {
    erros.valor = ATE(LIMITES_DO_SEGREDO.valor);
  }
  if (Object.keys(erros).length > 0) return { ok: false, erros };
  return {
    ok: true,
    dados: {
      nome,
      tipo: entrada.tipo as TipoDeSegredo,
      classificacao: entrada.classificacao as ClassificacaoDeSegredo,
      ...opcionais,
      validade: datas.validade.ok ? datas.validade.valor : null,
      proximaRotacao: datas.proximaRotacao.ok ? datas.proximaRotacao.valor : null,
      valor: typeof valor === 'string' ? valor : null,
    },
  };
}

/** "Vencido" quando a validade passou, e "Rotação atrasada" quando a data dela passou. */
export function situacaoDaValidade(
  { validade, proximaRotacao }: { validade: string | null; proximaRotacao: string | null },
  /** Hoje em aaaa-mm-dd, no fuso de quem vê. */
  hoje: string,
): { vencido: boolean; rotacaoAtrasada: boolean } {
  return {
    vencido: validade !== null && validade < hoje,
    rotacaoAtrasada: proximaRotacao !== null && proximaRotacao < hoje,
  };
}
