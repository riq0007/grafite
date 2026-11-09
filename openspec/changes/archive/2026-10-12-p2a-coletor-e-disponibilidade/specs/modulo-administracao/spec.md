## ADDED Requirements

### Requirement: Tela de coletores

A seção Coletores SHALL aparecer para quem tem `coletores.administrar`. Ela SHALL listar os coletores ativos pelo nome, com:
- as faixas de rede;
- a situação, em texto;
- o último contato com a idade, ou "Sem contato ainda";
- a versão informada no último contato.

Um coletor ativo sem contato há mais de 10 minutos SHALL aparecer com "Sem contato há 25 min", na situação de atenção, com o ícone e o texto. Os inativos SHALL aparecer pelo filtro de situação. A idade do último contato SHALL ficar no máximo 1 minuto atrás.

A seção SHALL oferecer:
- "Novo coletor", com o nome e as faixas, uma por linha;
- na ficha do coletor, a edição do nome e das faixas, "Trocar o token", a inativação e a reativação.

O token, no cadastro e na troca, SHALL aparecer num diálogo com "Copiar" e o aviso "Copie o token agora: ele não aparece de novo.", e SHALL NOT voltar a aparecer depois que o diálogo fecha. A troca do token SHALL pedir confirmação, com "O token atual para de valer na hora, e o coletor que o usa para de coletar até receber o novo.". A inativação SHALL pedir confirmação, com "O coletor para de coletar, e os ativos dele passam ao coletor que alcançar o IP deles.".

Sem nenhum coletor, a seção SHALL dizer "Nenhum coletor ainda." e oferecer "Novo coletor".

Os retornos SHALL ser "Coletor cadastrado.", "Coletor salvo.", "Token trocado.", "Coletor inativado." e "Coletor reativado.".

#### Scenario: Primeiro coletor
- **WHEN** quem administra os coletores abre a seção numa organização sem coletores
- **THEN** a seção diz "Nenhum coletor ainda." e oferece "Novo coletor"

#### Scenario: Token mostrado uma vez
- **WHEN** quem administra os coletores cadastra o "Coletor de Jundiaí" e fecha o diálogo do token
- **THEN** a ficha do coletor não mostra mais o token, só "Trocar o token"

#### Scenario: Coletor parado
- **WHEN** o "Coletor de Jundiaí" não fala com a API há 25 minutos
- **THEN** a lista mostra "Sem contato há 25 min", com o ícone de atenção

#### Scenario: Sem a permissão
- **WHEN** uma conta sem `coletores.administrar` abre o endereço da seção Coletores
- **THEN** a tela diz "Você não tem acesso a Coletores.", com a quem pedir acesso
