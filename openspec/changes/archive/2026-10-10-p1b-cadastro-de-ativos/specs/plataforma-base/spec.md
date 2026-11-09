## ADDED Requirements

### Requirement: Endereços da web servidos pela API

Com a web compilada, a API SHALL entregar o `index.html` a todo pedido de página (um GET que aceita HTML, sem extensão no caminho) fora do `/api`, mesmo quando o endereço é o de uma rota da API, como `/ativos`. Fora do `/api`, só a saúde (`/health`) SHALL continuar com a API. A web SHALL falar com a API sempre pelo `/api`.

#### Scenario: Recarregar a lista dos ativos
- **WHEN** o usuário recarrega a página `/ativos` no navegador
- **THEN** a web abre a lista dos ativos, e não a resposta da API

#### Scenario: A saúde aberta no navegador
- **WHEN** alguém abre `/health` no navegador
- **THEN** a API responde a saúde
