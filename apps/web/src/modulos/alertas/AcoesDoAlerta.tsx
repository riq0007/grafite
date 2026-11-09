// O reconhecer e o adiar de um alerta (spec modulo-alertas, "Lista dos alertas abertos" e "Alertas
// na ficha do ativo"): para quem pode tratá-lo, com o retorno em aviso e as listas relidas. Adiar
// oferece 15 minutos, 30 minutos e 1 hora, nunca mais.
import { avisar, Botao, ItemDeMenu, Menu, useDataHora } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { pedir } from '../../api/pedir.ts';
import { useApi } from '../../api/useApi.tsx';
import estilos from './Alertas.module.css';
import { type AlertaNaLista, CHAVE_DOS_ALERTAS } from './consultas.ts';

const ADIAMENTOS = [
  { minutos: 15, rotulo: '15 minutos' },
  { minutos: 30, rotulo: '30 minutos' },
  { minutos: 60, rotulo: '1 hora' },
] as const;

export function AcoesDoAlerta({ alerta }: { alerta: AlertaNaLista }) {
  const api = useApi();
  const consultas = useQueryClient();
  const { formatarHora } = useDataHora();
  const [fazendo, definirFazendo] = useState<'reconhecer' | 'adiar' | null>(null);
  const noAlerta = { params: { path: { id: alerta.id } } };

  const depois = async (resultado: { erro: string } | { dados: unknown }, aviso: string) => {
    definirFazendo(null);
    if ('erro' in resultado) {
      avisar({ situacao: 'critico', titulo: resultado.erro });
      return;
    }
    avisar({ situacao: 'sucesso', titulo: aviso });
    await consultas.invalidateQueries({ queryKey: CHAVE_DOS_ALERTAS });
  };

  return (
    <span className={estilos.acoes}>
      {!alerta.reconhecido && (
        <Botao
          nivel="secundario"
          carregando={fazendo === 'reconhecer'}
          rotuloCarregando="Reconhecendo"
          onPress={async () => {
            definirFazendo('reconhecer');
            await depois(
              await pedir(
                () => api.POST('/alertas/{id}/reconhecimento', noAlerta),
                'reconhecer o alerta',
              ),
              'Alerta reconhecido.',
            );
          }}
        >
          Reconhecer
        </Botao>
      )}
      <Menu
        rotulo="Adiar por"
        gatilho={
          <Botao nivel="secundario" carregando={fazendo === 'adiar'} rotuloCarregando="Adiando">
            Adiar
          </Botao>
        }
      >
        {ADIAMENTOS.map(({ minutos, rotulo }) => (
          <ItemDeMenu
            key={minutos}
            id={String(minutos)}
            onAction={async () => {
              definirFazendo('adiar');
              const resultado = await pedir(
                () => api.POST('/alertas/{id}/adiamento', { ...noAlerta, body: { minutos } }),
                'adiar o alerta',
              );
              await depois(
                resultado,
                'dados' in resultado
                  ? `Alerta adiado até ${formatarHora(new Date(resultado.dados.adiado.ate))}.`
                  : '',
              );
            }}
          >
            {rotulo}
          </ItemDeMenu>
        ))}
      </Menu>
    </span>
  );
}
