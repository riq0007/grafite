// Teclas de atalho como o sistema do usuário as mostra: "mod" é ⌘ no Mac e Ctrl nos demais.
// Cada tecla traz o símbolo (visível) e o nome (para o leitor de tela, que não lê "⌘").

export type Plataforma = 'mac' | 'outra';

export interface Tecla {
  simbolo: string;
  nome: string;
}

const igual = (texto: string): Record<Plataforma, Tecla> => ({
  mac: { simbolo: texto, nome: texto },
  outra: { simbolo: texto, nome: texto },
});

const seta = (simbolo: string, nome: string): Record<Plataforma, Tecla> => ({
  mac: { simbolo, nome },
  outra: { simbolo, nome },
});

const TECLAS: Record<string, Record<Plataforma, Tecla>> = {
  mod: { mac: { simbolo: '⌘', nome: 'Command' }, outra: { simbolo: 'Ctrl', nome: 'Ctrl' } },
  ctrl: { mac: { simbolo: '⌃', nome: 'Control' }, outra: { simbolo: 'Ctrl', nome: 'Ctrl' } },
  shift: { mac: { simbolo: '⇧', nome: 'Shift' }, outra: { simbolo: 'Shift', nome: 'Shift' } },
  alt: { mac: { simbolo: '⌥', nome: 'Option' }, outra: { simbolo: 'Alt', nome: 'Alt' } },
  enter: { mac: { simbolo: '↩', nome: 'Return' }, outra: { simbolo: 'Enter', nome: 'Enter' } },
  esc: igual('Esc'),
  tab: igual('Tab'),
  space: igual('Espaço'),
  up: seta('↑', 'Seta para cima'),
  down: seta('↓', 'Seta para baixo'),
  left: seta('←', 'Seta para a esquerda'),
  right: seta('→', 'Seta para a direita'),
};

export function formatarAtalho(teclas: string[], plataforma: Plataforma): Tecla[] {
  return teclas.map((tecla) => {
    const conhecida = TECLAS[tecla.toLowerCase()];
    if (conhecida) return conhecida[plataforma];
    const texto = tecla.length === 1 ? tecla.toUpperCase() : tecla;
    return { simbolo: texto, nome: texto };
  });
}

/** Plataforma de quem usa, pelo navegador (no servidor, "outra"). */
export function plataformaAtual(): Plataforma {
  if (typeof navigator === 'undefined') return 'outra';
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? 'mac' : 'outra';
}
