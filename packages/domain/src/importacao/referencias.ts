// As referências lidas pelo texto da célula (spec importacao-de-ativos, "Valores da planilha";
// design do P1e, decisão 4): o local pelo caminho ou pelo nome, a pessoa pela matrícula, pelo
// e-mail ou pelo nome, o modelo pelo fabricante e pelo nome, ou só pelo nome, e o fornecedor pelo
// CNPJ ou pelo nome (change p4a-fornecedores, design, decisão 3). Quem chama passa só os registros
// ativos; a leitura devolve o id, ou a recusa que diz o que fazer.
import { aceito, type Leitura, recusado, vazio } from '../campos/tipos.ts';
import { lerCnpj, nomeNormalizadoDoFornecedor } from '../fornecedores/fornecedor.ts';
import type { LocalDaArvore } from '../locais/arvore.ts';
import { normalizarTexto } from '../texto.ts';

export interface PessoaParaBusca {
  id: string;
  nome: string;
  email: string | null;
  matricula: string | null;
}

export interface ModeloParaBusca {
  id: string;
  fabricante: string;
  nome: string;
}

/** O fornecedor ativo, com o CNPJ guardado, de 14 caracteres, ou nulo. */
export interface FornecedorParaBusca {
  id: string;
  nome: string;
  cnpj: string | null;
}

export interface ReferenciasPorTexto {
  local(celula: unknown): Leitura<string>;
  pessoa(celula: unknown): Leitura<string>;
  modelo(celula: unknown): Leitura<string>;
  fornecedor(celula: unknown): Leitura<string>;
}

/** O texto da célula: o número da planilha vira texto, sem espaços nas pontas. */
const textoDa = (celula: unknown) =>
  typeof celula === 'string' || typeof celula === 'number' ? String(celula).trim() : '';

/** Os níveis de um caminho digitado, com "›" ou ">" entre eles. */
const niveisDo = (texto: string) =>
  texto
    .split(/[›>]/u)
    .map((nivel) => normalizarTexto(nivel))
    .filter((nivel) => nivel !== '');

function agrupar<T>(itens: Iterable<T>, chaves: (item: T) => (string | null)[]) {
  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    for (const chave of new Set(chaves(item))) {
      if (!chave) continue;
      mapa.set(chave, [...(mapa.get(chave) ?? []), item]);
    }
  }
  return mapa;
}

export function criarReferencias({
  locais,
  pessoas,
  modelos,
  fornecedores = [],
}: {
  locais: readonly LocalDaArvore[];
  pessoas: readonly PessoaParaBusca[];
  modelos: readonly ModeloParaBusca[];
  fornecedores?: readonly FornecedorParaBusca[];
}): ReferenciasPorTexto {
  // O nome e o CNPJ são únicos entre os fornecedores da organização: um mapa de cada basta.
  const fornecedoresPeloCnpj = new Map(
    fornecedores.flatMap((fornecedor) =>
      fornecedor.cnpj ? [[fornecedor.cnpj, fornecedor.id] as const] : [],
    ),
  );
  const fornecedoresPeloNome = new Map(
    fornecedores.map((fornecedor) => [nomeNormalizadoDoFornecedor(fornecedor.nome), fornecedor.id]),
  );
  // Os locais ativos, cada um com os níveis do caminho, da raiz até ele.
  const porId = new Map(locais.map((local) => [local.id, local]));
  const caminhos = locais
    .filter((local) => local.situacao === 'ativo')
    .map((local) => {
      const nomes: string[] = [];
      for (let atual: LocalDaArvore | undefined = local; atual; ) {
        nomes.unshift(atual.nome);
        atual = atual.paiId ? porId.get(atual.paiId) : undefined;
      }
      return { id: local.id, nomes, niveis: nomes.map((nome) => normalizarTexto(nome)) };
    });

  const pelaMatricula = agrupar(pessoas, (pessoa) => [
    pessoa.matricula ? normalizarTexto(pessoa.matricula) : null,
  ]);
  const peloEmail = agrupar(pessoas, (pessoa) => [
    pessoa.email ? normalizarTexto(pessoa.email) : null,
  ]);
  const peloNome = agrupar(pessoas, (pessoa) => [normalizarTexto(pessoa.nome)]);

  const modelosPeloNome = agrupar(modelos, (modelo) => [normalizarTexto(modelo.nome)]);
  const modelosPeloNomeCompleto = agrupar(modelos, (modelo) => [
    normalizarTexto(`${modelo.fabricante} ${modelo.nome}`),
  ]);

  return {
    local(celula) {
      if (vazio(celula)) return aceito(null);
      const texto = textoDa(celula);
      const pedidos = niveisDo(texto);
      if (pedidos.length === 0) return aceito(null);
      // O caminho pode começar em qualquer nível: vale o fim do caminho de cada local.
      const achados = caminhos.filter(
        (caminho) =>
          caminho.niveis.length >= pedidos.length &&
          pedidos.every(
            (nivel, i) => caminho.niveis[caminho.niveis.length - pedidos.length + i] === nivel,
          ),
      );
      const [primeiro] = achados;
      if (!primeiro) return recusado(`Local não encontrado: ${texto}.`);
      if (achados.length > 1) {
        const nome = primeiro.nomes.slice(-pedidos.length).join(' › ');
        return recusado(
          `Há mais de um local ${nome}: use o caminho, como ${primeiro.nomes.join(' › ')}.`,
        );
      }
      return aceito(primeiro.id);
    },

    pessoa(celula) {
      if (vazio(celula)) return aceito(null);
      const texto = textoDa(celula);
      const chave = normalizarTexto(texto);
      for (const mapa of [pelaMatricula, peloEmail]) {
        const [unica, outra] = mapa.get(chave) ?? [];
        if (unica && !outra) return aceito(unica.id);
      }
      const pelo = peloNome.get(chave) ?? [];
      const [primeira] = pelo;
      if (!primeira) return recusado(`Pessoa não encontrada: ${texto}.`);
      if (pelo.length > 1) {
        return recusado(
          `Há mais de uma pessoa com o nome ${primeira.nome}: use a matrícula ou o e-mail.`,
        );
      }
      return aceito(primeira.id);
    },

    modelo(celula) {
      if (vazio(celula)) return aceito(null);
      const texto = textoDa(celula);
      const chave = normalizarTexto(texto);
      const [completo] = modelosPeloNomeCompleto.get(chave) ?? [];
      if (completo) return aceito(completo.id);
      const pelo = modelosPeloNome.get(chave) ?? [];
      const [primeiro] = pelo;
      if (!primeiro) return recusado(`Modelo não encontrado: ${texto}.`);
      if (pelo.length > 1) {
        return recusado(
          `Há mais de um modelo ${primeiro.nome}: use o fabricante e o nome, como ${primeiro.fabricante} ${primeiro.nome}.`,
        );
      }
      return aceito(primeiro.id);
    },

    fornecedor(celula) {
      if (vazio(celula)) return aceito(null);
      const texto = textoDa(celula);
      const cnpj = lerCnpj(texto);
      const id =
        (cnpj ? fornecedoresPeloCnpj.get(cnpj) : undefined) ??
        fornecedoresPeloNome.get(nomeNormalizadoDoFornecedor(texto));
      return id ? aceito(id) : recusado(`Fornecedor não encontrado: ${texto}.`);
    },
  };
}
