#!/usr/bin/env bash
# A verificação da instalação num Linux (spec operacao-em-linux, "Instalação de teste no Linux pelo
# CI"; change servidor-linux-com-docker, design, decisão 13), que o job "Instalação num Linux" roda
# dentro do docker:dind, depois do instalar.sh: cada promessa conferida de fora dos contêineres do
# Grafite, como quem opera conferiria, pelo comando grafite, pelo HTTPS e pelo psql.
# Uso: bash verificar-o-linux.sh saude <versão>
#      bash verificar-o-linux.sh painel <versão>
#      bash verificar-o-linux.sh backup
#      bash verificar-o-linux.sh atualizacao <versão> <versão maior>
#      bash verificar-o-linux.sh diagnostico
set -euo pipefail

PACOTES=/pacotes
RAIZ_DA_AC="$PACOTES/grafite-raiz.crt"
PRODUCAO=grafite.localhost
TESTE=grafite-teste.localhost

falhar() {
  printf '::error::%s\n' "$1" >&2
  exit 1
}

# Um pedido HTTPS ao endereço, pelo proxy do servidor, confiando só na raiz exportada.
https() {
  local endereco="$1" caminho="$2"
  shift 2
  curl --silent --show-error --fail --cacert "$RAIZ_DA_AC" \
    --resolve "$endereco:443:127.0.0.1" "$@" "https://$endereco$caminho"
}

# A versão que a saúde do endereço informa.
versao_de() {
  https "$1" /health | sed -n 's/.*"versao":"\([^"]*\)".*/\1/p'
}

saude() {
  local versao="$1"
  cd "$PACOTES"
  grafite proxy raiz "$PACOTES"
  local endereco ambiente resposta
  for par in "$PRODUCAO:producao" "$TESTE:teste"; do
    endereco="${par%%:*}"
    ambiente="${par##*:}"
    resposta="$(https "$endereco" /health)"
    echo "$endereco: $resposta"
    grep -q '"status":"ok"' <<<"$resposta" || falhar "A saúde de $endereco não está ok: $resposta"
    grep -q "\"ambiente\":\"$ambiente\"" <<<"$resposta" ||
      falhar "A saúde de $endereco não é a do ambiente $ambiente: $resposta"
    grep -q "\"versao\":\"$versao\"" <<<"$resposta" ||
      falhar "A saúde de $endereco não informa a versão $versao: $resposta"
  done

  https "$PRODUCAO" /health --head | grep -qi '^strict-transport-security:' ||
    falhar 'A produção não manda o HSTS.'
  if https "$TESTE" /health --head | grep -qi '^strict-transport-security:'; then
    falhar 'O teste manda o HSTS.'
  fi
  local http
  http="$(curl --silent --output /dev/null --write-out '%{http_code} %{redirect_url}' \
    --resolve "$PRODUCAO:80:127.0.0.1" "http://$PRODUCAO/health")"
  [[ "$http" =~ ^30[178]\ https://grafite\.localhost/health$ ]] ||
    falhar "O HTTP não redirecionou para o HTTPS: $http"

  local sessao
  sessao="$(https "$PRODUCAO" /api/sessao)"
  grep -q '"nome":"Empresa de Ensaio"' <<<"$sessao" && grep -q '"operaOServidor":true' <<<"$sessao" ||
    falhar "A sessão da produção não é a da organização que opera o servidor: $sessao"

  # A credencial do teste recusada pelo banco da produção e aceita pelo do teste.
  local url senha
  url="$(sed -n "s/^GRAFITE_DATABASE_URL='\(.*\)'\$/\1/p" /opt/grafite/teste/config.env)"
  # A senha da conexão: depois do usuário e antes do arroba.
  senha="${url#*://*:}"
  senha="${senha%%@*}"
  if docker run --rm --pull never --network grafite --env "PGPASSWORD=$senha" \
    "grafite/banco:$versao" psql -h banco-producao -U grafite_app -d grafite -c 'select 1' \
    >/dev/null 2>&1; then
    falhar 'A credencial do teste abriu o banco da produção.'
  fi
  docker run --rm --pull never --network grafite --env "PGPASSWORD=$senha" \
    "grafite/banco:$versao" psql -h banco-teste -U grafite_app -d grafite_teste -c 'select 1' \
    >/dev/null || falhar 'A credencial do teste não abriu o banco do teste.'
  echo 'A credencial do teste é recusada pelo banco da produção.'
}

# O painel da operação (change painel-da-operacao, design, decisão 10): pelo comando, sem o
# navegador, numa porta publicada só no 127.0.0.1 do servidor; a sessão pelo código e o estado.
painel() {
  local versao="$1" porta=4390 saida cookies achado base codigo estado
  saida="$(mktemp)"
  cookies="$(mktemp)"
  grafite painel --sem-navegador --porta "$porta" >"$saida" 2>&1 &
  local processo=$!
  for _ in $(seq 1 90); do
    achado="$(grep -o 'http://127\.0\.0\.1:[0-9]*/#[A-Za-z0-9_-]*' "$saida" | head -n 1 || true)"
    [ -n "$achado" ] && break
    sleep 1
  done
  base="${achado%%/#*}"
  codigo="${achado#*/#}"
  # As conferências num subshell: a falha sai dele, e o painel é encerrado de qualquer jeito.
  local resultado=0
  (
    [ -n "$achado" ] || { cat "$saida"; falhar 'O painel não escreveu o endereço.'; }
    [ "$base" = "http://127.0.0.1:$porta" ] || falhar "O painel não está na porta $porta: $achado"
    [ "$(curl --silent --output /dev/null --write-out '%{http_code}' "$base/api/estado")" = 401 ] ||
      falhar 'O painel respondeu a um pedido sem a sessão.'
    curl --silent --show-error --fail --cookie-jar "$cookies" --header 'content-type: application/json' \
      --data "{\"codigo\":\"$codigo\"}" "$base/api/sessao" >/dev/null
    estado="$(curl --silent --show-error --fail --cookie "$cookies" "$base/api/estado")"
    grep -q '"plataforma":"linux"' <<<"$estado" && grep -q "\"atual\":\"$versao\"" <<<"$estado" ||
      falhar "O estado do painel não confere: $estado"
    echo "O painel em $base mostra a instalação na $versao."
  ) || resultado=$?
  kill "$processo" 2>/dev/null || true
  docker ps --quiet --filter "publish=$porta" | xargs -r docker rm --force >/dev/null
  wait "$processo" 2>/dev/null || true
  rm -f "$saida" "$cookies"
  return "$resultado"
}

backup() {
  cd "$PACOTES"
  local comando
  for comando in 'backup agora' 'backup listar' 'backup testar' \
    'preparar-teste --confirmar grafite_teste'; do
    echo "== grafite $comando"
    # shellcheck disable=SC2086
    grafite $comando || falhar "grafite $comando falhou."
  done
  local destino
  for destino in /opt/grafite/backups /mnt/nas/grafite; do
    [ -n "$(ls -A "$destino/grafite-producao" 2>/dev/null)" ] || falhar "Nenhum backup em $destino."
    # O backup feito pelo comando, como o root, fica do usuário dos contêineres, para o app.
    [ "$(stat -c %u "$destino/grafite-producao")" = 1000 ] ||
      falhar "A pasta dos backups em $destino não é do usuário dos contêineres."
  done
  local sessao
  sessao="$(https "$TESTE" /api/sessao)"
  grep -q '"nome":"Empresa de Ensaio"' <<<"$sessao" && grep -q '"ambiente":"teste"' <<<"$sessao" ||
    falhar "O teste não tem a cópia da produção: $sessao"
}

atualizacao() {
  local versao="$1" maior="$2"
  local pacote="$PACOTES/grafite-$maior-linux-x64.tar"
  cd "$PACOTES"
  grafite atualizar "$pacote" --ambiente teste
  [ "$(versao_de "$TESTE")" = "$maior" ] || falhar "O teste não foi para a $maior."
  grafite atualizar "$pacote" --ambiente producao --confirmar grafite
  [ "$(versao_de "$PRODUCAO")" = "$maior" ] || falhar "A produção não foi para a $maior."
  grafite voltar --ambiente producao --confirmar grafite
  [ "$(versao_de "$PRODUCAO")" = "$versao" ] || falhar "A produção não voltou à $versao."
  grafite servicos estado
}

# O que os contêineres e a instalação dizem, sem os segredos, quando algo falha.
diagnostico() {
  set +e
  echo '== Os contêineres'
  docker ps --all --format '{{.Names}} {{.Image}} {{.Status}}'
  local conteiner
  for conteiner in $(docker ps --all --format '{{.Names}}' | grep '^grafite-'); do
    echo "== O log de $conteiner"
    docker logs --tail 60 "$conteiner" 2>&1
  done
  local arquivo
  for arquivo in /opt/grafite/operacao.json /opt/grafite/instalacao.json /opt/grafite/.env \
    /opt/grafite/caddy/Caddyfile; do
    if [ -f "$arquivo" ]; then
      echo "== $arquivo"
      cat "$arquivo"
    fi
  done
  return 0
}

case "${1:-}" in
  saude) saude "${2:?Falta a versão.}" ;;
  painel) painel "${2:?Falta a versão.}" ;;
  backup) backup ;;
  atualizacao) atualizacao "${2:?Falta a versão.}" "${3:?Falta a versão maior.}" ;;
  diagnostico) diagnostico ;;
  *) falhar 'Use saude <versão>, painel <versão>, backup, atualizacao <versão> <versão maior> ou diagnostico.' ;;
esac
