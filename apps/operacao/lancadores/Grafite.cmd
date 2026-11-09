@echo off
rem O atalho do painel da operacao do Grafite (change painel-da-operacao; antes, o do menu, da
rem instalador-e-menu-da-operacao, design, decisao 6). Fica na raiz da instalacao, ao lado do
rem grafite.ps1 e do grafite.ico: pede a elevacao, abre o painel no navegador e deixa a janela aberta
rem enquanto ele roda; o painel fecha com ela. O menu fica no "grafite.ps1 menu", para o terminal. O
rem atalho "Grafite" da area de trabalho aponta para ele.
rem No repositorio, com LF, como todo texto; o empacotar.ts o grava com CRLF, que o cmd.exe exige.
setlocal
chcp 65001 >nul
set "GRAFITE_PAINEL=%~f0"
rem O "net session" so responde a um administrador.
net session >nul 2>&1
if errorlevel 1 (
  powershell.exe -NoProfile -NonInteractive -Command "try { Start-Process -FilePath $env:GRAFITE_PAINEL -Verb RunAs -ErrorAction Stop } catch { exit 1 }"
  if errorlevel 1 (
    echo O painel do Grafite precisa da elevação de administrador: abra o atalho de novo e aceite o pedido do Windows.
    pause
  )
  exit /b
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0grafite.ps1" painel
echo.
pause
