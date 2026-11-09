import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bell, Search, Settings2, SlidersHorizontal, Wrench } from 'lucide-react';
import { iconesDeAtivo } from './ativos.ts';
import { Icone } from './Icone.tsx';

const meta: Meta = { title: 'Ícones/Tipos de ativo' };
export default meta;

const grade = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))',
  gap: 'var(--esp-4)',
} as const;

const celula = {
  display: 'grid',
  justifyItems: 'center',
  gap: 'var(--esp-2)',
  padding: 'var(--esp-3)',
  border: '1px solid var(--cor-linha)',
  borderRadius: 'var(--raio-controle)',
  background: 'var(--cor-superficie)',
  color: 'var(--cor-texto)',
} as const;

const legenda = { fontSize: 'var(--texto-rotulo)', color: 'var(--cor-texto-2)' } as const;

/** Os 11 ícones de tipo de ativo ao lado de ícones de interface, no mesmo traço. */
export const LadoALado: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--esp-6)' }}>
      <div style={grade}>
        {Object.entries(iconesDeAtivo).map(([tipo, icone]) => (
          <div key={tipo} style={celula}>
            <span style={{ display: 'flex', gap: 'var(--esp-2)', alignItems: 'end' }}>
              <Icone icone={icone} tamanho={16} />
              <Icone icone={icone} tamanho={20} />
              <Icone icone={icone} tamanho={24} rotulo={tipo} />
            </span>
            <span style={legenda}>{tipo}</span>
          </div>
        ))}
      </div>
      <div style={grade}>
        {Object.entries({ Search, Bell, Settings2, SlidersHorizontal, Wrench }).map(
          ([nome, icone]) => (
            <div key={nome} style={celula}>
              <Icone icone={icone} tamanho={24} rotulo={nome} />
              <span style={legenda}>interface: {nome}</span>
            </div>
          ),
        )}
      </div>
    </div>
  ),
};
