## Why

O PMG tem o mapa da planta da unidade: o desenho do DXF convertido num modelo navegável, com as impressoras e os ID Faces posicionados. No Grafite ainda não dá para ver onde as coisas estão. Para os ativos, é o P7 · Mapa da planta da spec mestre (seção 3.2):
- a conversão do DXF;
- a posição de qualquer ativo;
- o estado dos ativos no mapa.

O usuário quer também ver no mapa os dashboards que estão rodando, as salas de reunião em uso e as máquinas com acesso remoto. Esses módulos vêm depois e põem a camada deles no mapa que esta change cria.

## What Changes

- **As plantas da organização.** Uma planta nasce de um arquivo:
  - o DXF do desenho, convertido no servidor para o modelo navegável, com as linhas por camada e os textos;
  - ou o modelo já convertido do PMG, em JSON, importado como está.

  A planta tem o nome, o local opcional, a largura e a profundidade em metros e a contagem do que veio. Ela pode ser renomeada e inativada.
- **O mapa:** a planta vista de cima, numa tela própria. Ele tem:
  - o arrastar e o zoom (roda, botões e "Ver a planta inteira");
  - a lista das camadas do desenho, que se ligam e desligam;
  - a busca pelos ativos e pelos textos do desenho, que leva a vista até o achado;
  - o aviso de que paredes e volumes são aproximações do desenho, e não medidas.
- **A posição de qualquer ativo,** pelo "Posicionar no mapa": escolher o ativo, clicar no ponto e salvar. Mover e tirar do mapa também ficam disponíveis, para quem tem `mapa.editar`.
- **O estado no mapa:** cada ativo posicionado mostra a pior situação dele por extenso e com o tom:
  - um alerta crítico aberto;
  - offline;
  - um alerta de atenção;
  - online;
  - ou sem coleta.

  O clique abre o resumo e o "Abrir ficha".
- **As camadas dos módulos.** A API monta os marcadores por fornecedores registrados, um por tipo de alvo. Os ativos são o primeiro; as salas, os dashboards e o acesso remoto entram depois, sem mudar o mapa.
- **As permissões:**
  - `mapa.ver`: ver as plantas e o mapa;
  - `mapa.editar`: posicionar e cadastrar as plantas.

  O que aparece de cada ativo segue o `ativos.ver` do local dele.

## Capabilities

### New Capabilities
- `mapa-da-planta`: as plantas, a conversão do DXF e a importação do modelo do PMG, o mapa navegável, as posições, o estado dos ativos no mapa, as camadas dos módulos e as permissões.

### Modified Capabilities
Nenhuma.

## Impact

- **Domínio:**
  - o conversor do DXF (LINE, LWPOLYLINE, POLYLINE, ARC, CIRCLE, TEXT, MTEXT e INSERT com os blocos) e a leitura do modelo do PMG;
  - a situação do marcador;
  - as permissões, a auditoria e o evento `mapa.mudou`.
- **Banco:** a migration 0043, com as plantas e as posições, e o RLS forçado.
- **API:**
  - o envio do arquivo e a conversão;
  - as plantas, o modelo e os marcadores pelos fornecedores;
  - as posições.
- **Web:** o módulo Mapa no dock, com a lista das plantas, o mapa em canvas, as camadas, a busca, o posicionamento e o cadastro das plantas.
- **Fora desta change:** a vista 3D e uma revisão nova da planta com as posições levadas junto ficam para depois.
