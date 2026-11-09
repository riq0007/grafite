import { avisar, CabecalhoDaPagina } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { pedir } from '../../api/pedir.ts';
import { useApi } from '../../api/useApi.tsx';
import { useAcesso } from '../../sessao/useAcesso.ts';
import { recusaDe } from '../administracao/recusa.ts';
import { SemPermissao } from '../administracao/SemPermissao.tsx';
import estilos from './Cofre.module.css';
import { aplicarSegredo } from './consultas.ts';
import { FormularioDoSegredo, SEGREDO_VAZIO } from './FormularioDoSegredo.tsx';

/**
 * O cadastro de um segredo (spec modulo-cofre, "Cadastro e ficha do segredo"), para quem administra
 * o cofre: os dados, os vínculos e o valor. Cadastrado, ele abre na ficha, e quem cadastrou ganha o
 * acesso a ele.
 */
export function SegredoNovo() {
  const { pode } = useAcesso();
  const api = useApi();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  if (!pode('cofre.administrar')) {
    return (
      <>
        <CabecalhoDaPagina titulo="Novo segredo" />
        <SemPermissao a="ao cadastro de segredos" />
      </>
    );
  }
  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Novo segredo" />
      <FormularioDoSegredo
        inicial={SEGREDO_VAZIO}
        comValor
        rotuloDoEnvio="Cadastrar"
        aoCancelar={() => void navegar({ to: '/cofre' })}
        enviar={async (pedido) => {
          const resultado = await pedir(
            () => api.POST('/cofre/segredos', { body: { ...pedido, valor: pedido.valor ?? '' } }),
            'cadastrar o segredo',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          await aplicarSegredo(consultas, resultado.dados);
          avisar({ situacao: 'sucesso', titulo: 'Segredo cadastrado.' });
          await navegar({ to: '/cofre/$id', params: { id: resultado.dados.id } });
          return { ok: true };
        }}
      />
    </div>
  );
}
