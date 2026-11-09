import type { Meta, StoryObj } from '@storybook/react-vite';
import { PackageSearch } from 'lucide-react';
import { TeclaDeAtalho } from '../atalho/TeclaDeAtalho.tsx';
import { Avatar } from '../avatar/Avatar.tsx';
import { Botao } from '../botao/Botao.tsx';
import { BarraDeProgresso } from './BarraDeProgresso.tsx';
import { Esqueleto } from './Esqueleto.tsx';
import { EstadoVazio } from './EstadoVazio.tsx';

const meta: Meta = { title: 'Componentes/Exibição' };
export default meta;

type Historia = StoryObj;

const superficie = {
  display: 'grid',
  gap: 'var(--esp-4)',
  maxWidth: 'calc(var(--esp-12) * 8)',
  padding: 'var(--esp-4)',
  borderRadius: 'var(--raio-janela)',
  background: 'var(--cor-superficie)',
} as const;

const linha = { display: 'flex', alignItems: 'center', gap: 'var(--esp-2)' } as const;

export const AvatarETeclas: Historia = {
  render: () => (
    <div style={superficie}>
      <div style={linha}>
        <Avatar nome="Helena Matos de Osório" />
        <Avatar nome="Ana dos Santos" />
        <span style={linha}>
          <Avatar nome="Equipe de TI" decorativo />
          <span style={{ color: 'var(--cor-texto)' }}>Equipe de TI</span>
        </span>
      </div>
      <div style={{ ...linha, color: 'var(--cor-texto-2)' }}>
        Buscar em tudo <TeclaDeAtalho teclas={['mod', 'k']} plataforma="outra" />
        <TeclaDeAtalho teclas={['mod', 'k']} plataforma="mac" />
      </div>
    </div>
  ),
};

export const Progresso: Historia = {
  render: () => (
    <div style={superficie}>
      <BarraDeProgresso rotulo="Importando planilha de ativos" valor={40} />
      <BarraDeProgresso rotulo="Conectando ao coletor" />
    </div>
  ),
};

/** A área que carrega avisa o leitor de tela; os esqueletos são só desenho. */
export const Carregando: Historia = {
  render: () => (
    <section aria-busy="true" aria-label="Lista de ativos" style={superficie}>
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clipPath: 'inset(50%)',
        }}
      >
        Carregando ativos
      </span>
      {[1, 2, 3].map((n) => (
        <div key={n} style={linha}>
          <Esqueleto
            forma="bloco"
            largura="var(--tamanho-miniatura)"
            altura="var(--tamanho-miniatura)"
          />
          <div style={{ display: 'grid', gap: 'var(--esp-1)', flex: 1 }}>
            <Esqueleto largura="60%" />
            <Esqueleto largura="35%" />
          </div>
        </div>
      ))}
    </section>
  ),
};

export const Vazio: Historia = {
  render: () => (
    <div style={superficie}>
      <EstadoVazio
        icone={PackageSearch}
        titulo="Nenhum ativo encontrado"
        descricao="Ajuste os filtros ou cadastre um ativo."
        acao={<Botao nivel="primario">Cadastrar ativo</Botao>}
      />
    </div>
  ),
};
