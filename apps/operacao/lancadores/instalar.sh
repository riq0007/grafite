#!/usr/bin/env bash
# O roteiro de instalação do Grafite num servidor Linux (spec operacao-em-linux, "Instalação do zero
# no Linux"; change servidor-linux-com-docker, design, decisão 2). Antes de mudar qualquer coisa,
# ele confere o root, o Docker, o plugin compose e o hash do pacote. Depois, carrega as imagens do
# pacote, instala o lançador grafite e chama a instalação com a imagem do comando do próprio pacote.
# Rodar de novo retoma a instalação interrompida. A release o publica também ao lado do pacote, e,
# sem o pacote nos argumentos, ele usa o único da pasta dele (change instalar-sh-na-release). Pelo
# bash, porque o arquivo baixado vem sem a permissão de execução.
# Uso: sudo bash instalar.sh [grafite-x.y.z-linux-x64.tar] [--respostas <arquivo>]
set -euo pipefail

LANCADOR="${GRAFITE_LANCADOR:-/usr/local/bin/grafite}"

falhar() {
  printf '%s\n' "$1" >&2
  exit 1
}

if [ "$(id -u)" != 0 ]; then
  falhar 'A instalação do Grafite precisa do root: rode com o sudo, como sudo bash instalar.sh.'
fi
# Sem o pacote nos argumentos, o único da pasta do roteiro, e não da pasta atual.
if [ $# -eq 0 ] || [ "${1#--}" != "$1" ]; then
  pasta_do_roteiro="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  achados=()
  for candidato in "$pasta_do_roteiro"/grafite-*-linux-x64.tar; do
    if [ -f "$candidato" ]; then achados+=("$candidato"); fi
  done
  if [ "${#achados[@]}" -eq 0 ]; then
    falhar "Falta o pacote: baixe da release o grafite-x.y.z-linux-x64.tar e o .sha256 para a pasta $pasta_do_roteiro, a do instalar.sh."
  fi
  if [ "${#achados[@]}" -gt 1 ]; then
    falhar "A pasta $pasta_do_roteiro tem mais de um pacote do Grafite para Linux: deixe nela só o da versão que vai instalar, ou diga qual, como sudo bash instalar.sh grafite-x.y.z-linux-x64.tar."
  fi
  set -- "${achados[0]}" "$@"
fi
pacote="$1"
shift

if ! command -v docker >/dev/null 2>&1; then
  falhar 'O Docker não está instalado neste servidor: instale o Docker Engine e o plugin compose, como diz o runbook, e rode a instalação de novo.'
fi
if ! docker info >/dev/null 2>&1; then
  falhar 'O Docker deste servidor não respondeu: confira se o serviço dele está rodando (systemctl status docker).'
fi
if ! docker compose version >/dev/null 2>&1; then
  falhar 'O plugin compose do Docker não está instalado: instale o docker-compose-plugin, como diz o runbook, e rode a instalação de novo.'
fi

if [ ! -f "$pacote" ]; then falhar "O pacote $pacote não existe."; fi
nome="$(basename "$pacote")"
pasta="$(cd "$(dirname "$pacote")" && pwd)"
if [ ! -f "$pasta/$nome.sha256" ]; then
  falhar "Falta o $nome.sha256, publicado com o pacote: baixe-o para a mesma pasta."
fi
if ! (cd "$pasta" && sha256sum --check --status "$nome.sha256"); then
  falhar "O pacote $nome não confere com o hash publicado. Nada foi mudado: baixe o pacote e o .sha256 de novo."
fi
versao="$(tar -xOf "$pacote" pacote.json | sed -n 's/.*"versao": *"\([0-9][0-9.]*\)".*/\1/p' | head -n 1)"
if [ -z "$versao" ]; then falhar "O $nome não é um pacote do Grafite para Linux."; fi

echo "Carregando as imagens da versão $versao no Docker."
tar -xOf "$pacote" imagens.tar.gz | docker load >/dev/null
tar -xOf "$pacote" grafite >"$LANCADOR.novo"
chmod 755 "$LANCADOR.novo"
mv "$LANCADOR.novo" "$LANCADOR"
echo "Lançador instalado em $LANCADOR."

GRAFITE_VERSAO_DO_COMANDO="$versao" exec "$LANCADOR" instalar "$pacote" "$@"
