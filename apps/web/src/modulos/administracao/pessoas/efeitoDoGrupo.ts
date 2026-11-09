// O efeito de incluir a conta num grupo ou de retirá-la dele, em texto, antes de confirmar (spec
// administracao-de-pessoas, "Acesso de uma conta"; design do escolhas-a-vista, decisão 5). A tela
// calcula pelos perfis que o grupo dá e pelas atribuições em vigor da conta; a API confere tudo de
// novo ao gravar.

interface LocalDoEscopo {
  id: string;
  caminho: string;
}

interface PerfilDoGrupo {
  perfil: { id: string; nome: string };
  /** Nulo na organização inteira. */
  local: LocalDoEscopo | null;
}

export interface GrupoDoEfeito {
  id: string;
  nome: string;
  perfisEmVigor: readonly PerfilDoGrupo[];
}

export interface AtribuicaoDoEfeito extends PerfilDoGrupo {
  /** O grupo de onde a atribuição vem; nulo na atribuída direto à conta. */
  grupo: { id: string; nome: string } | null;
}

const noEscopo = (local: LocalDoEscopo | null) =>
  local ? `em ${local.caminho}` : 'na organização inteira';

const deOnde = (atribuicao: AtribuicaoDoEfeito) =>
  atribuicao.grupo ? `pelo grupo ${atribuicao.grupo.nome}` : 'atribuído direto à conta';

/** A atribuição da conta com o mesmo perfil no mesmo escopo, que não vem do grupo dado. */
function porOutroCaminho(
  { perfil, local }: PerfilDoGrupo,
  atribuicoes: readonly AtribuicaoDoEfeito[],
  grupoId: string,
) {
  return atribuicoes.find(
    (atribuicao) =>
      atribuicao.perfil.id === perfil.id &&
      (atribuicao.local?.id ?? null) === (local?.id ?? null) &&
      atribuicao.grupo?.id !== grupoId,
  );
}

const semPerfis = (nome: string, grupo: GrupoDoEfeito) =>
  `O grupo ${grupo.nome} não dá nenhum perfil: o acesso de ${nome} não muda.`;

/** O que a conta passa a ter ao entrar no grupo, e o que ela já tinha por outro caminho. */
export function efeitoDeIncluir(
  nome: string,
  grupo: GrupoDoEfeito,
  atribuicoes: readonly AtribuicaoDoEfeito[],
): string[] {
  if (grupo.perfisEmVigor.length === 0) return [semPerfis(nome, grupo)];
  return grupo.perfisEmVigor.map((dado) => {
    const outro = porOutroCaminho(dado, atribuicoes, grupo.id);
    const perfil = `${dado.perfil.nome} ${noEscopo(dado.local)}`;
    return outro ? `${nome} já tem ${perfil}, ${deOnde(outro)}.` : `${nome} passa a ter ${perfil}.`;
  });
}

/** O que a conta deixa de ter ao sair do grupo, e o que ela continua tendo por outro caminho. */
export function efeitoDeRetirar(
  nome: string,
  grupo: GrupoDoEfeito,
  atribuicoes: readonly AtribuicaoDoEfeito[],
): string[] {
  if (grupo.perfisEmVigor.length === 0) return [semPerfis(nome, grupo)];
  return grupo.perfisEmVigor.map((dado) => {
    const outro = porOutroCaminho(dado, atribuicoes, grupo.id);
    const perfil = `${dado.perfil.nome} ${noEscopo(dado.local)}`;
    return outro
      ? `${nome} continua com ${perfil}, ${deOnde(outro)}.`
      : `${nome} deixa de ter ${perfil}.`;
  });
}
