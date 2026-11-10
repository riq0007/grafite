## 1. As preferências

- [x] 1.1 Escrever primeiro os testes e depois o campo `dock.modulos` no domínio, nos esquemas da API e no contrato (design, decisão 1). Verificar: os testes do domínio passam com "Módulo repetido na lista", "Ajustes na lista" e "Preferências de antes desta lista", o teste de integração das preferências grava a lista na conta e nos padrões da organização, e o `pnpm contrato:verificar` passa.
- [x] 1.2 Mover as funções da ordem para `apps/web/src/preferencias/listaOrdenada.ts`, com os testes delas, e apontar o Início para lá (decisão 1). Verificar: os testes da lista e os do Início passam sem mudar o que conferem.

## 2. O dock

- [ ] 2.1 Escrever primeiro os testes e depois o `modulosDaCasca` com a lista que vale, devolvendo os módulos do dock, os do Mais e os Ajustes (decisão 2). Verificar: os testes passam com "Ordem escolhida", "Módulo ligado depois", "Módulo sem acesso na ordem" e "Padrão da organização".
- [ ] 2.2 Escrever primeiro a história e depois a propriedade `modulosNoMais` do `Dock` (decisão 3). Verificar: as histórias passam com "Mais com os módulos tirados" e "Excedentes e tirados juntos", pelo teclado também, e as histórias de hoje continuam passando.
- [ ] 2.3 Escrever primeiro os testes e depois a prioridade do celular pela lista (decisão 5). Verificar: os testes passam com "Ordem escolhida no celular" e "Módulo tirado do dock no celular".
- [ ] 2.4 Ligar a `CascaDoApp` às três listas. Verificar: o teste da casca passa com "Módulo tirado continua na busca", e o dock muda sem recarregar quando a preferência chega de outra sessão.

## 3. Os Ajustes

- [ ] 3.1 Escrever primeiro os testes e depois a parte "Módulos do dock" da seção Dock, com o foco depois de mover e a entrada na busca (decisão 4). Verificar: os testes passam com "Subir um módulo", "Tirar do dock", "Pôr de volta no dock", "Restaurar a ordem" e "Ordem pela busca".
- [ ] 3.2 Escrever primeiro o teste e depois conferir a mesma parte nos padrões da organização. Verificar: o teste dos Padrões passa gravando a lista na organização, e uma conta sem lista própria passa a segui-la.

## 4. Fechamento

- [ ] 4.1 Conferir no `pnpm dev`: subir a Operação, tirar as Salas, abrir as Salas pelo Mais e pela busca, restaurar, e repetir com o dock à esquerda e numa janela baixa. Verificar: o dock muda na hora, o Mais aparece com as Salas, e nada se sobrepõe à barra superior.
- [ ] 4.2 Gravar a referência visual da história nova do dock. Verificar: o `pnpm test:visual` passa.
- [ ] 4.3 Atualizar a spec mestre (seções 7.2 e 7.4) e o mapa. Verificar: os testes da documentação e do mapa passam.
- [ ] 4.4 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:integration`;
  - `pnpm test:stories`;
  - `pnpm test:e2e`;
  - `pnpm contrato:verificar`;
  - `openspec validate dock-personalizavel --strict`.

  Verificar: os comandos passam.
