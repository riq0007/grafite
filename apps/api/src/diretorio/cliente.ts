// O cliente do diretório (spec diretorio-ad; change integracao-ad-ldap, design, decisão 1): o que a
// API pede ao AD, atrás de uma interface. A produção usa o ldapts; os testes de integração, um AD
// em memória.
import { MENSAGENS_DO_DIRETORIO } from '@grafite/domain';

/** Um usuário do AD, como a tela e a entrada o leem. */
export interface UsuarioDoDiretorio {
  dn: string;
  /** O valor do atributo do usuário, como o sAMAccountName. */
  usuario: string;
  nome: string;
  email: string | null;
  /** A conta ativa no AD, pelo userAccountControl. */
  ativa: boolean;
  /** Os DNs dos grupos do AD (memberOf). */
  grupos: string[];
}

export interface GrupoDoDiretorio {
  dn: string;
  nome: string;
  membros: number;
}

/** A configuração do diretório com a conta de serviço já aberta do Cofre. */
export interface AcessoAoDiretorio {
  servidor: string;
  baseDn: string;
  atributoDoUsuario: string;
  filtroDasPessoas: string;
  conferirCertificado: boolean;
  /** A AC da empresa, em PEM, que emite o certificado do LDAPS; o cliente a soma às públicas. */
  acDoServidor?: string | null;
  conta: { usuario: string; senha: string };
}

export interface ClienteDoDiretorio {
  /** Quantos usuários a base tem pelo filtro das pessoas, até passar do limite. */
  contarUsuarios(limite: number): Promise<number>;
  /** O usuário com a senha conferida no AD, ou `null` sem o usuário ou com a senha errada. */
  autenticar(usuario: string, senha: string): Promise<UsuarioDoDiretorio | null>;
  buscarUsuarios(termo: string, limite: number): Promise<UsuarioDoDiretorio[]>;
  usuario(dn: string): Promise<UsuarioDoDiretorio | null>;
  buscarGrupos(termo: string, limite: number): Promise<GrupoDoDiretorio[]>;
  grupo(dn: string): Promise<GrupoDoDiretorio | null>;
  membros(grupoDn: string, limite: number): Promise<UsuarioDoDiretorio[]>;
  incluirNoGrupo(usuarioDn: string, grupoDn: string): Promise<void>;
  tirarDoGrupo(usuarioDn: string, grupoDn: string): Promise<void>;
  mudarSituacao(usuarioDn: string, ativa: boolean): Promise<void>;
  redefinirSenha(usuarioDn: string, senha: string): Promise<void>;
}

export type ConectarDiretorio = (acesso: AcessoAoDiretorio) => ClienteDoDiretorio;

export const MOTIVOS_DA_FALHA_DO_DIRETORIO = {
  'nao-respondeu': MENSAGENS_DO_DIRETORIO.naoRespondeu,
  'conta-recusada': MENSAGENS_DO_DIRETORIO.contaRecusada,
  certificado: MENSAGENS_DO_DIRETORIO.certificado,
  'sem-permissao': 'A conta de serviço não tem permissão para esta mudança no AD.',
  'politica-da-senha': 'A senha nova não atende à política de senhas do AD.',
  'nao-encontrado': 'O usuário ou o grupo não existe mais no AD.',
  recusado: 'O AD recusou o pedido.',
} as const;

export type MotivoDaFalhaDoDiretorio = keyof typeof MOTIVOS_DA_FALHA_DO_DIRETORIO;

/** O AD não atendeu: o motivo em texto, sem a causa, que pode trazer o DN da conta de serviço. */
export class FalhaDoDiretorio extends Error {
  readonly motivo: MotivoDaFalhaDoDiretorio;

  constructor(motivo: MotivoDaFalhaDoDiretorio) {
    super(MOTIVOS_DA_FALHA_DO_DIRETORIO[motivo]);
    this.name = 'FalhaDoDiretorio';
    this.motivo = motivo;
  }
}
