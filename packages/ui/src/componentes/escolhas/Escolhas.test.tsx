import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Checkbox } from './Checkbox.tsx';
import { ControleSegmentado, Segmento } from './ControleSegmentado.tsx';
import { Interruptor } from './Interruptor.tsx';
import { GrupoDeRadios, Radio } from './Radio.tsx';

afterEach(cleanup);

describe('Checkbox', () => {
  it('é nomeado pelo próprio texto e pode começar marcado', () => {
    render(<Checkbox defaultSelected>Ativo em garantia</Checkbox>);
    const caixa = screen.getByRole('checkbox', { name: 'Ativo em garantia' }) as HTMLInputElement;
    expect(caixa.checked).toBe(true);
  });

  it('tem o estado misto, para "marcar todos" com parte marcada', () => {
    render(<Checkbox isIndeterminate>Selecionar todos</Checkbox>);
    const caixa = screen.getByRole('checkbox', { name: 'Selecionar todos' }) as HTMLInputElement;
    expect(caixa.indeterminate).toBe(true);
  });
});

describe('GrupoDeRadios', () => {
  it('o grupo tem rótulo visível e cada rádio, o seu', () => {
    render(
      <GrupoDeRadios rotulo="Criticidade" obrigatorio>
        <Radio value="baixa">Baixa</Radio>
        <Radio value="alta">Alta</Radio>
      </GrupoDeRadios>,
    );
    expect(screen.getByRole('radiogroup', { name: 'Criticidade' })).toBeDefined();
    const alta = screen.getByRole('radio', { name: 'Alta' }) as HTMLInputElement;
    expect(alta.required).toBe(true);
    expect(screen.getByText('obrigatório').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('erro de fora aparece em texto', () => {
    render(
      <GrupoDeRadios rotulo="Criticidade" erro="Escolha a criticidade do ativo.">
        <Radio value="baixa">Baixa</Radio>
      </GrupoDeRadios>,
    );
    expect(screen.getByText('Escolha a criticidade do ativo.')).toBeDefined();
  });
});

describe('Interruptor', () => {
  it('tem o papel de interruptor e o nome do próprio texto', () => {
    render(<Interruptor defaultSelected>Avisos por e-mail</Interruptor>);
    const chave = screen.getByRole('switch', { name: 'Avisos por e-mail' }) as HTMLInputElement;
    expect(chave.checked).toBe(true);
  });
});

describe('ControleSegmentado', () => {
  it('é um grupo de escolha única, com o segmento inicial marcado', () => {
    render(
      <ControleSegmentado rotulo="Visualização" defaultValue="grade">
        <Segmento value="lista">Lista</Segmento>
        <Segmento value="grade">Grade</Segmento>
      </ControleSegmentado>,
    );
    expect(screen.getByRole('radiogroup', { name: 'Visualização' })).toBeDefined();
    expect((screen.getByRole('radio', { name: 'Grade' }) as HTMLInputElement).checked).toBe(true);
  });

  it('a descrição fica à vista e ligada ao grupo', () => {
    render(
      <ControleSegmentado rotulo="Movimento" descricao="O sistema pede movimento reduzido.">
        <Segmento value="sistema">Seguir o sistema</Segmento>
        <Segmento value="reduzido">Reduzir</Segmento>
      </ControleSegmentado>,
    );
    const grupo = screen.getByRole('radiogroup', { name: 'Movimento' });
    const descricao = screen.getByText('O sistema pede movimento reduzido.');
    expect(grupo.getAttribute('aria-describedby')?.split(' ')).toContain(descricao.id);
  });
});
