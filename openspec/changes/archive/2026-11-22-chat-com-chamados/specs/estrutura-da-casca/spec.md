## ADDED Requirements

### Requirement: Arquivo solto fora de um lugar de soltar

Em nenhuma tela da casca, o arquivo arrastado do computador e solto fora de um lugar de soltar, como o campo de arquivo de um cadastro e a conversa do chat, SHALL trocar o Grafite pelo arquivo na aba. Fora desses lugares, o cursor SHALL mostrar que ali não se solta, e soltar SHALL NOT fazer nada. Num lugar de soltar, o arquivo SHALL seguir a regra dele.

#### Scenario: PDF solto no dock
- **WHEN** o usuário arrasta um PDF do computador e o solta sobre o dock
- **THEN** nada acontece, e o Grafite continua na aba como estava

#### Scenario: Foto num campo de arquivo
- **WHEN** o usuário solta uma foto no campo de arquivo de um cadastro
- **THEN** a foto entra no campo, como antes
