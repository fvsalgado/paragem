#!/usr/bin/env bash
# Vigia o sítio de fora, como quem o visita. O desenho é o do Coreto.
#
# Quatro perguntas, por esta ordem:
#
#   1. A página do produto responde? Só se `PARAGEM_PRODUTO_URL` estiver
#      definida: o domínio é de quem licencia e não se fixa no código
#      (CLAUDE.md §4.7), e é uma variável do repositório.
#   2. Cada região desta raiz responde no seu domínio? A lista sai do
#      `dominio:` de cada `regioes/<id>/regiao.yaml` — uma região nova entra
#      na vigilância sem se tocar aqui, e a de um cliente, que vive noutra raiz,
#      não entra num repositório público. A página tem de vir 200 e trazer o
#      próprio endereço no corpo (o canónico): é o que distingue «a região a
#      servir» de «um anfitrião desconhecido a mostrar a página do produto»,
#      que também é um 200.
#   3. Os dados de cada região chegam? O sítio lê-os do armazém a cada pedido,
#      e uma página em cache pode esconder um armazém em baixo. Pede-se o
#      primeiro ficheiro de `/dados-abertos/` — que redireciona para o armazém
#      — e só o primeiro KiB.
#   4. O certificado de cada domínio ainda dura? Renova-se sozinho na
#      plataforma, e é por isso que ninguém repara quando deixa de renovar.
#
# Cada pedido tem três tentativas com pausa a crescer, para um soluço de rede
# não abrir um issue. Sai 1 se alguma pergunta ficar sem a resposta certa; o
# relatório fica em `relatorio.md`, que o workflow cola no issue.
set -euo pipefail

DIAS_DE_CERTIFICADO="${DIAS_DE_CERTIFICADO:-21}"
PRODUTO="${PARAGEM_PRODUTO_URL:-}"
RELATORIO="${RELATORIO:-relatorio.md}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
falhas=0
: > "${RELATORIO}"

falhou() {
  falhas=$((falhas + 1))
  echo "✗ $1"
  echo "- $1" >> "${RELATORIO}"
}

# O corpo fica em corpo.tmp; o código HTTP sai no stdout — 000 quando nem
# chegou a ligar.
pedir() {
  curl --silent --location --max-time 20 \
    --user-agent 'Paragem (vigilancia)' \
    --output corpo.tmp --write-out '%{http_code}' "$@" || echo 000
}

# pagina <nome> <url> <texto que o corpo tem de trazer>
pagina() {
  local nome=$1 url=$2 esperado=$3 codigo=000 tentativa
  for tentativa in 1 2 3; do
    codigo=$(pedir "${url}")
    if [ "${codigo}" = 200 ] && grep --quiet --fixed-strings -- "${esperado}" corpo.tmp; then
      echo "✓ ${nome} — ${url}"
      return 0
    fi
    sleep $((tentativa * 10))
  done
  if [ "${codigo}" = 200 ]; then
    falhou "${nome} — ${url} respondeu 200 mas sem «${esperado}» no corpo: está a servir outra coisa"
  else
    falhou "${nome} — ${url} respondeu ${codigo}"
  fi
}

# dados_chegam <nome> <origem>
dados_chegam() {
  local nome=$1 origem=$2 codigo=000 ficheiro tentativa
  codigo=$(pedir "${origem}/dados-abertos/")
  ficheiro=$(grep --only-matching --extended-regexp 'href="/dados-abertos/[^"]+\.(zip|json|geojson)"' corpo.tmp 2> /dev/null \
    | head -1 | sed -E 's/^href="|"$//g') || ficheiro=''
  if [ "${codigo}" != 200 ] || [ -z "${ficheiro}" ]; then
    falhou "${nome} — ${origem}/dados-abertos/ respondeu ${codigo} sem um ficheiro para descarregar"
    return 0
  fi
  for tentativa in 1 2 3; do
    codigo=$(pedir --range 0-1023 "${origem}${ficheiro}")
    if [ "${codigo}" = 200 ] || [ "${codigo}" = 206 ]; then
      echo "✓ ${nome} — os dados chegam (${ficheiro})"
      return 0
    fi
    sleep $((tentativa * 10))
  done
  falhou "${nome} — ${origem}${ficheiro} respondeu ${codigo}: o armazém não está a servir"
}

# certificado_dura <domínio>
#
# Sem tentativas repetidas: um certificado não fica bom à terceira. Se a
# ligação não abrir, não se inventa um veredito — as perguntas de cima já dizem
# se o domínio responde.
certificado_dura() {
  local dominio=$1 fim dias
  fim=$(echo \
    | openssl s_client -servername "${dominio}" -connect "${dominio}:443" 2> /dev/null \
    | openssl x509 -noout -enddate 2> /dev/null \
    | cut -d= -f2) || fim=''
  if [ -z "${fim}" ]; then
    echo "· ${dominio} — não deu para ler o certificado (ignorado)"
    return 0
  fi
  dias=$((($(date --date="${fim}" +%s) - $(date +%s)) / 86400))
  if [ "${dias}" -lt "${DIAS_DE_CERTIFICADO}" ]; then
    falhou "certificado de ${dominio} — expira em ${dias} dia(s), a ${fim}"
    return 0
  fi
  echo "✓ certificado ${dominio} — ${dias} dias"
}

# 1. O produto.
if [ -n "${PRODUTO}" ]; then
  pagina 'produto' "${PRODUTO%/}/" 'Paragem.pt'
  certificado_dura "$(printf '%s' "${PRODUTO}" | sed -E 's#^https?://##; s#/.*$##')"
else
  echo '· produto — sem PARAGEM_PRODUTO_URL nas variáveis do repositório (saltado)'
fi

# 2-4. Cada região desta raiz.
encontradas=0
for declaracao in "${RAIZ}"/regioes/*/regiao.yaml; do
  id=$(basename "$(dirname "${declaracao}")")
  dominio=$(sed -n -E 's/^dominio:[[:space:]]*["'"'"']?([^"'"'"'[:space:]#]+).*/\1/p' "${declaracao}" | head -1)
  [ -n "${dominio}" ] || continue
  encontradas=$((encontradas + 1))
  pagina "região ${id}" "https://${dominio}/" "https://${dominio}/"
  dados_chegam "região ${id}" "https://${dominio}"
  certificado_dura "${dominio}"
done
if [ "${encontradas}" -eq 0 ]; then
  falhou 'nenhuma região desta raiz declara um dominio: no regiao.yaml — não há nada para vigiar'
fi

rm --force corpo.tmp

echo
if [ "${falhas}" -gt 0 ]; then
  echo "${falhas} pergunta(s) sem a resposta certa."
  exit 1
fi
echo 'Tudo a responder.'
