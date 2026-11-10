## Why

Com a verificação em dois passos ativa, o código do app é pedido em toda entrada, e a sessão dura no máximo 12 horas: quem usa o Grafite todo dia digita o código todo dia, no mesmo computador. Em 09/11/2026 o usuário pediu que a "verificação de login só é pedida a cada 30 dias", com o prazo "personalizável pelo admin para todos os usuários ou específicos".

Esta change segue o subprojeto F2 · Núcleo da spec mestre, na entrada com os dois passos (F2a). Ficam fora dela:
- o código por e-mail e a aprovação pelo celular, que são outra change;
- a entrada pela Microsoft ou por outro provedor (A3);
- mudar a duração da sessão, que continua em 2 horas sem uso e 12 no total;
- o Cofre e as confirmações pelo código do app, que continuam pedindo o código.

## What Changes

- **Confiar neste aparelho:** no passo do código da entrada, a caixa "Confiar neste aparelho por N dias". Marcada, as próximas entradas daquela conta naquele navegador pedem só a senha, até o prazo acabar.
- **O prazo da confiança:** a organização define o prazo, de 0 a 90 dias, com 30 de fábrica e 0 para pedir o código sempre. Um perfil e uma conta podem ter um prazo próprio.
- **Os aparelhos da conta:** a seção Conta dos Ajustes ganha a parte "Aparelhos confiáveis", com "Esquecer" em cada um e "Esquecer todos". Quem administra contas vê e esquece os aparelhos de outra conta.
- **O que esquece os aparelhos sozinho:** trocar ou redefinir a senha, ativar, desativar ou remover os dois passos e inativar a conta ou a pessoa.
- **O que não muda:** o Cofre continua pedindo o código do app para revelar e copiar, e o código de recuperação não torna o aparelho confiável.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `verificacao-em-dois-passos`: o aparelho confiável, o prazo da confiança e o que esquece os aparelhos.
- `entrada-e-sessoes`: o passo do código dispensado no aparelho confiável.
- `tela-de-entrada`: a caixa "Confiar neste aparelho" no passo do código.
- `ajustes-do-sistema`: a parte "Aparelhos confiáveis" da seção Conta.
- `administracao-de-pessoas`: os aparelhos e o prazo de uma conta pela administração.
- `perfis-e-grupos`: o prazo da confiança no perfil.
- `fila-de-tarefas`: a manutenção diária apaga os aparelhos confiáveis marcados há mais de 90 dias.

## Impact

- `packages/domain/src/acesso`: a resolução do prazo e a validade do aparelho.
- `packages/db`: a tabela dos aparelhos confiáveis, a da política de entrada da organização, uma coluna em `contas`, outra em `perfis` e outra em `sessoes`, com a migration.
- `apps/api/src/acesso`: a entrada, o passo do código, as mudanças da conta que esquecem os aparelhos e as rotas novas; o contrato gerado.
- `packages/ui/src/entrada` e `apps/web/src/sessao`: a tela de entrada.
- `apps/web/src/modulos/ajustes/secoes/Conta.tsx` e `apps/web/src/modulos/administracao` (pessoas e perfis).
- A manutenção diária, que apaga os aparelhos vencidos.
- A spec mestre (seção 9), o runbook e o mapa.
