## 1. Compatibilidade SNMP

- [x] 1.1 Escrever regressão para GETBULK recusado, observar falhar e implementar GETNEXT; verificar testes do coletor e leitura real da HP.

## 2. Agente do GLPI

- [x] 2.1 Escrever regressões do PROLOG sem compressão e limite descomprimido, observar falhar, corrigir parser e instruções; verificar testes de protocolo, tela e runbook.

## 3. Painéis HTTP

- [x] 3.1 Escrever testes da ponte (autorização, origem, recursos, isolamento e erros), observar falhar e implementar; verificar testes da API e checagem de tipos.
- [x] 3.2 Escrever teste da grade com HTTP em HTTPS, observar falhar e ligar a ponte; verificar testes da web e navegação em navegador.

## 4. Entrega na GPT

- [x] 4.1 Sincronizar specs e mapa, atualizar versão e registrar diagnóstico; verificar OpenSpec, lint, tipos e build locais.
- [x] 4.2 Montar os artefatos disponíveis e publicar release `Versão X.x.x NÃO VERIFICADA` apontando para GPT, sem CI nem merge; verificar título, commit e arquivos publicados.

Publicada Versão 0.1.6 NÃO VERIFICADA, como pré-lançamento, no commit `2a02d0a2b2170c1642fcfb77f543d9a1f4d69262` da GPT. Os três arquivos Windows foram enviados e seus hashes conferidos; o ZIP contém 11.182 arquivos e teve todos os CRCs validados. SHA-256: `eb3859b662b55069ff7cc942c3e7f7af61aa3f4513f0eb3dd6fa459b2c74df92`. Consulta ao GitHub após publicar: zero execuções de Actions para esse commit. A tag própria não corresponde ao gatilho `v*.*.*` do workflow de versão.
