## Context

Ver proposal.md. O log local do agente registra `certificate verify failed` antes do PROLOG. O DNS resolve o Grafite para o servidor interno. A conexão diagnóstica apresenta uma cadeia assinada pela inspeção HTTPS de um antivírus. A HP responde GET em v1/v2c e recusa GETBULK com GeneralError.

## Goals / Non-Goals

**Goals:** recuperar a leitura SNMP, orientar a configuração TLS correta e mostrar painéis HTTP por HTTPS.

**Non-Goals:** inventar percentuais, liberar TLS globalmente, oferecer um proxy para URLs arbitrárias, alterar main ou executar CI.

## Decisions

1. SNMP mantém a versão e a comunidade configuradas. Quando GETBULK falha, tenta GETNEXT na mesma sessão. Erro de objeto ausente encerra a tabela; erro geral persistente não vira sucesso vazio. Teste com simulador que recusa GETBULK e leitura real da HP.
2. O agente continua validando TLS. O guia explica a CA interna e a inspeção HTTPS, `ca-cert-file`, reinício do serviço, execução forçada e os erros do log. A API aceita PROLOG XML puro além das compressões já suportadas, com limite também após descompressão.
3. A ponte serve somente a origem do painel cadastrado, ativo e permitido. Uma entrada autenticada cria um acesso temporário em memória, ligado à sessão e organização; os recursos usam esse acesso, sem expor o cookie da sessão ao painel. A API revalida sessão e permissão e não encaminha cookies nem Authorization ao destino. Limita tempo, tamanho e redirecionamentos e recusa saída da origem cadastrada.
4. O documento da ponte usa sandbox sem allow-same-origin, também imposto por CSP. Reescreve URLs de HTML/CSS do mesmo servidor e chamadas fetch/XHR. A grade conserva nome, situação, expandir e link original. Endereços HTTPS podem continuar diretos. Aplicações que dependem de login de terceiros, WebSocket ou origem própria podem precisar de configuração de URL pública no serviço de origem; não se promete compatibilidade universal.
5. A release usa tag que não casa com `v*.*.*` para não disparar o workflow, aponta para um commit da GPT e leva notas explícitas da ausência de CI. Nenhum workflow existente será alterado.

## Risks / Trade-offs

- Certificado interceptado → diagnosticar pelo log e instruir instalação da CA aprovada pela TI, nunca confiar automaticamente no certificado recebido da rede.
- Conteúdo de terceiros na origem do Grafite → sandbox opaco, acesso limitado ao painel e nenhuma credencial encaminhada.
- Recursos em outras origens → manter os HTTPS externos; serviços HTTP adicionais exigem configuração do painel.
- Release sem CI → título NÃO VERIFICADA e registro dos testes locais e das limitações da montagem.

## Migration Plan

Atualizar aplicação e coletor juntos. Não há alteração de banco. Voltar ao pacote anterior reverte o comportamento. Os acessos temporários dos painéis são recriados ao abrir a grade após reinício da API.
