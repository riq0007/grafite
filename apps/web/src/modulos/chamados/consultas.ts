// As chaves das consultas dos chamados (spec modulo-chamados, "Telas atualizadas e módulo
// desligado"; change chamados-da-ti, design, decisão 14, "O módulo na casca"): tudo o que é dos
// chamados fica debaixo de uma chave, que o `chamados.mudaram` relê de uma vez; a ficha, debaixo
// dela, relê também pelos eventos do que só ela mostra; e os ajustes ficam à parte, com o evento
// deles.

/** O começo da chave de toda consulta dos chamados: o quadro, os prazos e a ficha. */
export const CHAVE_DOS_CHAMADOS = ['chamados'] as const;

/** A chave da ficha do chamado, que mostra os alertas, a OS, a solicitação e o resumo do ativo. */
export const CHAVE_DA_FICHA_DO_CHAMADO = [...CHAVE_DOS_CHAMADOS, 'ficha'] as const;

/** O começo da chave dos ajustes: os tipos, o formulário, as respostas prontas e o horário. */
export const CHAVE_DOS_AJUSTES_DOS_CHAMADOS = ['ajustes-dos-chamados'] as const;
