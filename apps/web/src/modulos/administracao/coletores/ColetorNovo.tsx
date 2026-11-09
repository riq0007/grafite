import { avisar, CabecalhoDaPagina } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import estilos from '../Administracao.module.css';
import { recusaDe } from '../recusa.ts';
import { CHAVE_DOS_COLETORES, type Coletor } from './consultas.ts';
import { DialogoDoToken } from './DialogoDoToken.tsx';
import { COLETOR_VAZIO, FormularioDoColetor } from './FormularioDoColetor.tsx';

/**
 * O cadastro de um coletor (spec modulo-administracao, "Tela de coletores"): o nome e as faixas. O
 * token aparece uma vez, num diálogo; ao fechá-lo, a ficha do coletor abre, já sem o token.
 */
export function ColetorNovo() {
  const api = useApi();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  const [criado, definirCriado] = useState<{ coletor: Coletor; token: string } | null>(null);

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Novo coletor" />
      <FormularioDoColetor
        inicial={COLETOR_VAZIO}
        rotuloDoEnvio="Cadastrar"
        aoCancelar={() => void navegar({ to: '/administracao/coletores' })}
        enviar={async (pedido) => {
          const resultado = await pedir(
            () => api.POST('/coletores', { body: pedido }),
            'cadastrar o coletor',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          void consultas.invalidateQueries({ queryKey: CHAVE_DOS_COLETORES });
          definirCriado(resultado.dados);
          avisar({ situacao: 'sucesso', titulo: 'Coletor cadastrado.' });
          return { ok: true };
        }}
      />
      <DialogoDoToken
        nome={criado?.coletor.nome ?? ''}
        token={criado?.token ?? null}
        aoFechar={() => {
          if (!criado) return;
          void navegar({
            to: '/administracao/coletores/$id',
            params: { id: criado.coletor.id },
            replace: true,
          });
        }}
      />
    </div>
  );
}
