## Why

O agente desta estação não chega ao Grafite por falha na validação do certificado HTTPS. A HP Laser 408dn responde a GET, mas devolve GeneralError ao GETBULK do coletor; os erros viram tabelas vazias. Os painéis HTTP são bloqueados pela própria grade e pelo conteúdo misto do navegador.

## What Changes

- S5: explicar a confiança do certificado, o reinício do agente e a verificação dos logs na tela e no runbook; aceitar os formatos de PROLOG usados pelo agente sem compressão.
- P2b: recorrer ao GETNEXT quando a impressora recusar GETBULK, sem perder linhas já lidas e sem transformar falha em resposta vazia.
- S2: servir painéis HTTP pela API HTTPS, incluindo recursos do mesmo servidor, com conteúdo isolado da sessão do Grafite.
- F2d: publicar manualmente a versão na GPT, sem CI, com o título `Versão X.x.x NÃO VERIFICADA`, conforme exceção solicitada nesta entrega.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `inventario-pelo-agente`: orientação para certificados e PROLOG sem compressão.
- `impressoras-por-snmp`: compatibilidade com equipamentos que recusam GETBULK.
- `painel-de-dashboards`: ponte autenticada para o conteúdo dos painéis.
- `modulo-paineis`: exibição dos painéis HTTP na grade HTTPS.

## Impact

API, coletor, tela dos agentes, grade dos painéis e documentação operacional. Sem migration. As regras ANTISLOP v3 continuam valendo. Fora do escopo: alterar a infraestrutura do AD, desativar a inspeção do antivírus, desligar a validação TLS, alterar outras branches ou fazer merge. A change ativa `ci-sem-docker` fica intacta.
