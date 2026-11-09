// Destaques (escolha do usuário): cada um sai da matiz e do croma e é gerado para cada tema (spec
// mestre, Apêndice A.2). O Grafite, com croma 0, é o monocromático.
// destaque: preenchimento (botão primário, seleção, anel de foco);
// destaqueTexto: texto e ícone na cor do destaque sobre superfícies;
// sobreDestaque: texto sobre o preenchimento do destaque.
import { type DestaqueGerado, type EntradaDoDestaque, gerarDestaque } from './gerador.ts';
import { type IdDoTema, temas } from './temas.ts';

export {
  type CoresDoDestaque,
  type EstadosDoDestaque,
  estadosDoDestaque,
} from './papeis.ts';

export const destaques = {
  grafite: { matiz: 0, croma: 0 },
  azul: { matiz: 258, croma: 0.17 },
  verde: { matiz: 155, croma: 0.14 },
  laranja: { matiz: 55, croma: 0.16 },
} as const satisfies Record<string, EntradaDoDestaque>;

export type IdDoDestaque = keyof typeof destaques;

/** Nome de cada destaque como aparece para o usuário (Ajustes e DTCG). */
export const nomesDosDestaques: Record<IdDoDestaque, string> = {
  grafite: 'Grafite',
  azul: 'Azul',
  verde: 'Verde',
  laranja: 'Laranja',
};

const gerados = new Map<string, DestaqueGerado>();

/** O destaque gerado para um tema, guardado depois da primeira vez. */
export function destaqueDoTema(idDoTema: IdDoTema, idDoDestaque: IdDoDestaque): DestaqueGerado {
  const chave = `${idDoTema}/${idDoDestaque}`;
  const guardado = gerados.get(chave);
  if (guardado) return guardado;
  const gerado = gerarDestaque(temas[idDoTema], destaques[idDoDestaque]);
  gerados.set(chave, gerado);
  return gerado;
}
