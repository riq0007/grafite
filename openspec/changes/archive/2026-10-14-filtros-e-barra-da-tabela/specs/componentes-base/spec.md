## MODIFIED Requirements

### Requirement: Filtros ativos à vista

Os filtros ativos de uma lista SHALL aparecer como uma linha de rótulos, cada um com o nome do filtro, o operador, quando há mais de um possível, e o valor, e um botão para limpá-lo. Com algum filtro ativo, a linha SHALL ter "Limpar filtros". Cada botão de limpar SHALL ter um nome acessível que diz qual filtro ele limpa.

Numa tabela configurável, clicar num rótulo SHALL abrir o editor daquele filtro preso a ele, e, com o foco no rótulo, Enter SHALL abrir o editor e Backspace SHALL limpar o filtro.

#### Scenario: Limpar um filtro
- **WHEN** a lista está filtrada por "Situação: Inativas" e "Local: Jundiaí" e o usuário limpa o local
- **THEN** só "Situação: Inativas" continua, e a lista se atualiza

#### Scenario: Editar no lugar
- **WHEN** a tabela tem o filtro "Hostname · contém · almox", e o usuário clica nele
- **THEN** o editor do filtro do Hostname abre preso ao rótulo, com "almox" no campo
