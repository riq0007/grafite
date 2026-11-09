import type { Meta, StoryObj } from '@storybook/react-vite';
import { Download } from 'lucide-react';
import type { ReactNode } from 'react';
import { TeclaDeAtalho } from './atalho/TeclaDeAtalho.tsx';
import { Avatar } from './avatar/Avatar.tsx';
import { Botao } from './botao/Botao.tsx';
import { BuscaComSugestoes } from './busca/BuscaComSugestoes.tsx';
import { CampoDeTexto } from './campo/CampoDeTexto.tsx';
import { ControleDeslizante } from './deslizante/ControleDeslizante.tsx';
import { Checkbox } from './escolhas/Checkbox.tsx';
import { ControleSegmentado, Segmento } from './escolhas/ControleSegmentado.tsx';
import { Interruptor } from './escolhas/Interruptor.tsx';
import { GrupoDeRadios, Radio } from './escolhas/Radio.tsx';
import { BarraDeProgresso } from './exibicao/BarraDeProgresso.tsx';
import { MiniaturaDeAtivo } from './miniatura/MiniaturaDeAtivo.tsx';
import { Selecao } from './selecao/Selecao.tsx';
import { RotuloDeSituacao } from './situacao/RotuloDeSituacao.tsx';
import {
  CabecalhoDaTabela,
  Celula,
  Coluna,
  CorpoDaTabela,
  Linha,
  Tabela,
} from './tabela/Tabela.tsx';

/**
 * Página-matriz da regressão visual: os componentes principais juntos, capturados em cada
 * combinação de tema × densidade (design, decisão 8). Não tem interação.
 */
const meta: Meta = { title: 'Catálogo/Matriz', tags: ['matriz'] };
export default meta;

const situacoes = [
  { id: 'em-uso', rotulo: 'Em uso' },
  { id: 'em-estoque', rotulo: 'Em estoque' },
];

const ativos = [
  { id: '1', nome: 'HP LaserJet M404dn', tipo: 'impressora', patrimonio: 'PAT-00412' },
  { id: '2', nome: 'Aruba 2930F 48p', tipo: 'switch', patrimonio: 'PAT-00102' },
  { id: '3', nome: 'Nobreak 3 kVA', tipo: 'nobreak', patrimonio: 'PAT-00517' },
];

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 'var(--esp-3)', alignContent: 'start' }}>
      <h2 style={{ margin: 0, color: 'var(--cor-texto-2)', fontSize: 'var(--texto-dado)' }}>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

const linha = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--esp-2)',
} as const;

export const Matriz: StoryObj = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 'var(--esp-6)',
        padding: 'var(--esp-6)',
        borderRadius: 'var(--raio-janela)',
        background: 'var(--cor-superficie)',
      }}
    >
      <Secao titulo="Botões">
        <div style={linha}>
          <Botao nivel="primario">Salvar</Botao>
          <Botao>Cancelar</Botao>
          <Botao nivel="terciario" icone={Download}>
            Exportar
          </Botao>
          <Botao nivel="destrutivo">Dar baixa</Botao>
        </div>
      </Secao>
      <Secao titulo="Campos">
        <CampoDeTexto rotulo="Patrimônio" obrigatorio placeholder="Ex.: PAT-0001" />
        <Selecao rotulo="Situação" opcoes={situacoes} defaultSelectedKey="em-uso" />
        <BuscaComSugestoes rotulo="Local" sugestoes={situacoes} placeholder="Buscar local" />
        <CampoDeTexto
          rotulo="Endereço IP"
          defaultValue="10.0.0.300"
          erro="Endereço IP fora do formato."
        />
      </Secao>
      <Secao titulo="Escolhas">
        <div style={linha}>
          <Checkbox defaultSelected>Em garantia</Checkbox>
          <Interruptor defaultSelected>Avisos na tela</Interruptor>
        </div>
        <GrupoDeRadios rotulo="Criticidade" defaultValue="media">
          <Radio value="baixa">Baixa</Radio>
          <Radio value="media">Média</Radio>
        </GrupoDeRadios>
        <ControleSegmentado rotulo="Visualização" defaultValue="lista">
          <Segmento value="lista">Lista</Segmento>
          <Segmento value="grade">Grade</Segmento>
        </ControleSegmentado>
        <ControleDeslizante
          rotulo="Tamanho dos itens"
          unidade="px"
          minValue={28}
          maxValue={64}
          defaultValue={48}
        />
      </Secao>
      <Secao titulo="Situações e progresso">
        <div style={linha}>
          <RotuloDeSituacao situacao="sucesso">Em uso</RotuloDeSituacao>
          <RotuloDeSituacao situacao="atencao">Em manutenção</RotuloDeSituacao>
          <RotuloDeSituacao situacao="critico">Sem sinal</RotuloDeSituacao>
          <RotuloDeSituacao situacao="neutra">Em estoque</RotuloDeSituacao>
        </div>
        <BarraDeProgresso rotulo="Importando planilha" valor={40} />
        <div style={linha}>
          <Avatar nome="Helena Matos de Osório" />
          <TeclaDeAtalho teclas={['mod', 'k']} plataforma="outra" />
        </div>
      </Secao>
      <Secao titulo="Tabela">
        <Tabela rotulo="Ativos">
          <CabecalhoDaTabela>
            <Coluna id="imagem" rotuloOculto>
              Imagem
            </Coluna>
            <Coluna id="nome" principal ordenavel>
              Equipamento
            </Coluna>
            <Coluna id="patrimonio">Patrimônio</Coluna>
          </CabecalhoDaTabela>
          <CorpoDaTabela itens={ativos}>
            {(ativo) => (
              <Linha id={ativo.id}>
                <Celula>
                  <MiniaturaDeAtivo tipo={ativo.tipo} />
                </Celula>
                <Celula>{ativo.nome}</Celula>
                <Celula>{ativo.patrimonio}</Celula>
              </Linha>
            )}
          </CorpoDaTabela>
        </Tabela>
      </Secao>
    </div>
  ),
};
