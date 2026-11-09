// Os ativos de exemplo das histórias das tabelas: oito equipamentos, com o tipo, o local e a
// situação, como a lista dos ativos mostra.
import type { Situacao } from '../situacao/RotuloDeSituacao.tsx';

export interface Ativo {
  id: string;
  patrimonio: string;
  nome: string;
  tipo: string;
  local: string;
  situacao: { tipo: Situacao; texto: string };
}

export const ATIVOS: Ativo[] = [
  {
    id: '1',
    patrimonio: 'PAT-00412',
    nome: 'HP LaserJet M404dn',
    tipo: 'impressora',
    local: 'Almoxarifado · Jundiaí',
    situacao: { tipo: 'sucesso', texto: 'Em uso' },
  },
  {
    id: '2',
    patrimonio: 'PAT-00388',
    nome: 'Dell OptiPlex 7010',
    tipo: 'computador',
    local: 'Engenharia · Sala 2',
    situacao: { tipo: 'sucesso', texto: 'Em uso' },
  },
  {
    id: '3',
    patrimonio: 'PAT-00102',
    nome: 'Aruba 2930F 48p',
    tipo: 'switch',
    local: 'CPD · Rack A',
    situacao: { tipo: 'sucesso', texto: 'Em uso' },
  },
  {
    id: '4',
    patrimonio: 'PAT-00251',
    nome: 'Control iD iDFace',
    tipo: 'controle-de-acesso',
    local: 'Portaria principal',
    situacao: { tipo: 'atencao', texto: 'Em manutenção' },
  },
  {
    id: '5',
    patrimonio: 'PAT-00517',
    nome: 'Nobreak 3 kVA',
    tipo: 'nobreak',
    local: 'CPD',
    situacao: { tipo: 'neutra', texto: 'Em estoque' },
  },
  {
    id: '6',
    patrimonio: 'PAT-00233',
    nome: 'Câmera Intelbras VIP',
    tipo: 'camera',
    local: 'Estacionamento',
    situacao: { tipo: 'critico', texto: 'Sem sinal' },
  },
  {
    id: '7',
    patrimonio: 'PAT-00619',
    nome: 'Monitor LG 24"',
    tipo: 'monitor',
    local: 'Financeiro',
    situacao: { tipo: 'sucesso', texto: 'Em uso' },
  },
  {
    id: '8',
    patrimonio: 'PAT-00077',
    nome: 'Rack 42U',
    tipo: 'rack',
    local: 'CPD',
    situacao: { tipo: 'sucesso', texto: 'Em uso' },
  },
];
