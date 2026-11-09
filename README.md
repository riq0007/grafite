# Grafite

Sistema de gestão de ativos, operação e governança de TI, com uma casca inspirada no macOS. Substitui o PMG, o sistema anterior da equipe de TI.

Está em uso interno numa empresa e roda num servidor Windows ou num Linux com o Docker. Nasceu preparado para atender várias organizações, com o isolamento de cada uma garantido pelo banco.

## O que cobre

- **Ativos:** o catálogo, o cadastro, a tabela com as visões, a ficha com os relacionamentos, a importação e a etiqueta.
- **Monitoramento:** o coletor local, com a disponibilidade, as impressoras pelo SNMP e o Control iD; as regras, os alertas e as notificações na tela, por e-mail e no celular.
- **Operação:** os fornecedores, os consumíveis, o estoque, as solicitações e as ordens de serviço, com os indicadores.
- **Cofre:** os segredos da equipe, cifrados, com a confirmação pelo código do app antes de revelar.
- **Mapa:** a planta navegável, com a posição dos ativos.
- **Servidor:** a instalação, a atualização, o backup e o painel da operação, no Windows e no Linux.

## Como rodar no desenvolvimento

Precisa do Node 24, do pnpm pelo corepack e do Docker.

```bash
corepack enable
pnpm install
pnpm dev
```

O `pnpm dev` sobe o banco, a API, o coletor e a web, e cria a organização de desenvolvimento na primeira vez. As contas de desenvolvimento, os comandos e as regras do projeto estão no [`CLAUDE.md`](CLAUDE.md).

## Documentos

- [`docs/mapa.md`](docs/mapa.md): o mapa dos documentos, das specs e das changes, com o glossário.
- [A spec mestre](docs/superpowers/specs/2026-09-24-grafite-design.md): a referência de todos os subprojetos.
- [`docs/operacao/runbook.md`](docs/operacao/runbook.md): instalar, atualizar, voltar, fazer o backup e o resto da operação, no Windows e no Linux.
- [`openspec/`](openspec/): as specs das capacidades e as changes, com o arquivo das que já entraram.

## Versões

Os pacotes de cada versão, para o servidor Windows e para o servidor Linux com o Docker, ficam na [página das versões](https://github.com/riq0007/grafite/releases). Para instalar e atualizar, siga o runbook.

A primeira versão deste repositório é a 0.1.11. As anteriores, com o histórico delas, ficam num repositório privado.

## Direitos

Todos os direitos reservados. O código pode ser lido, mas não copiado, modificado nem redistribuído.
