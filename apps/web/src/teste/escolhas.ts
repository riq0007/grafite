// As escolhas da biblioteca nos testes da web, como o usuário as faz: a de local abre o painel pelo
// campo, filtra pelo nome e escolhe pelo caminho completo (spec componentes-base, "Escolha de local
// em árvore").
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect } from 'vitest';

/** O campo da escolha de local, que mostra o caminho do escolhido. */
export const campoDeLocal = (rotulo: string, dentro: HTMLElement = document.body) =>
  within(dentro).getByRole('button', { name: new RegExp(`^${rotulo}`) }) as HTMLButtonElement;

/** Abre o painel da escolha de local, quando os locais já chegaram, e devolve o painel. */
export async function abrirEscolhaDeLocal(rotulo: string, dentro: HTMLElement = document.body) {
  await waitFor(() => expect(campoDeLocal(rotulo, dentro).disabled).toBe(false));
  fireEvent.click(campoDeLocal(rotulo, dentro));
  return screen.findByRole('dialog', { name: rotulo });
}

/** Filtra o painel aberto pelo texto e devolve os caminhos achados. */
export async function filtrarLocais(painel: HTMLElement, texto: string) {
  const filtro = within(painel).getByRole('searchbox', { name: 'Filtrar' });
  filtro.focus();
  fireEvent.change(filtro, { target: { value: texto } });
  return (await within(painel).findAllByRole('option')).map((opcao) => opcao.textContent);
}

/** Escolhe o local pelo caminho, filtrando pelo último nome dele. */
export async function escolherLocal(
  rotulo: string,
  caminho: string,
  dentro: HTMLElement = document.body,
) {
  const painel = await abrirEscolhaDeLocal(rotulo, dentro);
  const nome = caminho.split(' › ').at(-1) ?? caminho;
  await filtrarLocais(painel, nome);
  fireEvent.click(within(painel).getByRole('option', { name: caminho }));
}

/**
 * O nome de uma opção da busca com sugestões: o rótulo, sem a descrição que só o leitor de tela lê,
 * como o "Sugerido" das sugeridas.
 */
export function nomeDaOpcao(opcao: HTMLElement): string {
  const doc = opcao.ownerDocument;
  const ids = (atributo: string) => opcao.getAttribute(atributo)?.split(/s+/).filter(Boolean) ?? [];
  const rotulos = ids('aria-labelledby')
    .map((id) => doc.getElementById(id)?.textContent ?? '')
    .filter(Boolean);
  if (rotulos.length > 0) return rotulos.join(' ');
  // O happy-dom não liga o rótulo à opção, mas ele está no lugar dele.
  const rotulo = opcao.querySelector('[slot="label"]')?.textContent;
  if (rotulo) return rotulo;
  // Sem o rótulo à parte, o texto da opção sem o da descrição.
  let texto = opcao.textContent ?? '';
  for (const id of ids('aria-describedby')) {
    const descricao = doc.getElementById(id)?.textContent;
    if (descricao) texto = texto.replace(descricao, '');
  }
  return texto;
}

export const nomesDasOpcoes = (opcoes: HTMLElement[]) => opcoes.map(nomeDaOpcao);
