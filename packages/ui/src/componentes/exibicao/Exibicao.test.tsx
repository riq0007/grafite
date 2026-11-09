import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TeclaDeAtalho } from '../atalho/TeclaDeAtalho.tsx';
import { Avatar } from '../avatar/Avatar.tsx';
import { Botao } from '../botao/Botao.tsx';
import { BarraDeProgresso } from './BarraDeProgresso.tsx';
import { Esqueleto } from './Esqueleto.tsx';
import { EstadoVazio } from './EstadoVazio.tsx';

afterEach(cleanup);

describe('Avatar', () => {
  it('sem imagem mostra as iniciais e é nomeado pelo nome completo', () => {
    render(<Avatar nome="Helena Matos de Osório" />);
    const avatar = screen.getByRole('img', { name: 'Helena Matos de Osório' });
    expect(avatar.textContent).toBe('HO');
  });

  it('decorativo quando o nome já aparece ao lado', () => {
    const { container } = render(<Avatar nome="Ana dos Santos" decorativo />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('sem nome é neutro: o ícone de pessoa, sem iniciais inventadas', () => {
    const { container } = render(<Avatar />);
    const avatar = screen.getByRole('img', { name: 'Usuário' });
    expect(avatar.textContent).toBe('');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('as miniaturas viram o srcSet, da menor para a maior, com o sizes do tamanho', () => {
    const { container } = render(
      <Avatar
        nome="Ana Souza"
        tamanho="ficha"
        imagens={{ 128: '/f-128.webp', 64: '/f-64.webp' }}
      />,
    );
    const foto = container.querySelector('img') as HTMLImageElement;
    expect(foto.getAttribute('srcset')).toBe('/f-64.webp 64w, /f-128.webp 128w');
    expect(foto.getAttribute('sizes')).toBe('48px');
    expect(foto.getAttribute('src')).toBe('/f-64.webp');
  });

  it('depois de uma foto que não carrega, uma foto nova é tentada', () => {
    const { container, rerender } = render(
      <Avatar nome="Ana Souza" imagens={{ 64: '/antiga-64.webp' }} />,
    );
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(screen.getByRole('img', { name: 'Ana Souza' }).textContent).toBe('AS');

    rerender(<Avatar nome="Ana Souza" imagens={{ 64: '/nova-64.webp' }} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/nova-64.webp');
  });
});

describe('TeclaDeAtalho', () => {
  it('mostra os símbolos e dá o nome de cada tecla ao leitor de tela', () => {
    const { container } = render(<TeclaDeAtalho teclas={['mod', 'k']} plataforma="mac" />);
    expect(container.querySelectorAll('kbd kbd')).toHaveLength(2);
    expect(container.textContent).toContain('⌘');
    expect(container.textContent).toContain('Command');
  });
});

describe('BarraDeProgresso', () => {
  it('com valor, anuncia o rótulo e o valor', () => {
    render(<BarraDeProgresso rotulo="Importando planilha" valor={40} />);
    const barra = screen.getByRole('progressbar', { name: 'Importando planilha' });
    expect(barra.getAttribute('aria-valuenow')).toBe('40');
  });

  it('sem valor, é indeterminada', () => {
    render(<BarraDeProgresso rotulo="Conectando ao coletor" />);
    const barra = screen.getByRole('progressbar', { name: 'Conectando ao coletor' });
    expect(barra.hasAttribute('aria-valuenow')).toBe(false);
  });
});

describe('Esqueleto', () => {
  it('é só desenho: fica oculto do leitor de tela', () => {
    const { container } = render(<Esqueleto largura="60%" />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('EstadoVazio', () => {
  it('diz o que houve em texto objetivo e oferece a ação, quando há', () => {
    render(
      <EstadoVazio
        titulo="Nenhum ativo encontrado"
        descricao="Ajuste os filtros ou cadastre um ativo."
        acao={<Botao nivel="primario">Cadastrar ativo</Botao>}
      />,
    );
    expect(screen.getByText('Nenhum ativo encontrado')).toBeDefined();
    expect(screen.getByText('Ajuste os filtros ou cadastre um ativo.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Cadastrar ativo' })).toBeDefined();
  });
});
