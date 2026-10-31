#!/usr/bin/env bash
# Manda um aviso para o telemóvel de quem está de serviço. É o do Coreto.
#
# O issue que a vigilância abre é bom registo e péssimo alarme: fica à espera
# de que alguém abra o separador. Isto é a campainha por cima.
#
#   avisar.sh <título> <prioridade> [ficheiro com o corpo]
#
# Sem `NTFY_URL` nos secrets, o que acontece depende da prioridade. Para `low`
# e `default` não faz nada e sai a zero. Para `high` e `urgent` sai a 1 e diz
# porquê: esses só correm quando alguma coisa já falhou, e «falhou e ninguém
# foi avisado» não pode terminar a verde.
#
# `NTFY_URL` é o endereço completo, tópico incluído — `https://ntfy.sh/<tópico>`
# ou um servidor próprio. No plano grátis do ntfy.sh quem souber o nome do
# tópico lê o que lá passa: a defesa é o nome ser longo e aleatório. O que passa
# por aqui são títulos de avaria, não credenciais nem dados de ninguém.
set -euo pipefail

TITULO="${1:?falta o título do aviso}"
PRIORIDADE="${2:-default}"
CORPO_FICHEIRO="${3:-}"

if [ -z "${NTFY_URL:-}" ]; then
  case "${PRIORIDADE}" in
    high | urgent | max | 4 | 5)
      echo "::error title=Ninguém foi avisado::«${TITULO}» é um aviso de prioridade ${PRIORIDADE} e não há NTFY_URL nos secrets: ficou só no issue."
      exit 1
      ;;
    *)
      echo "::notice::Sem NTFY_URL configurada: o aviso fica só no issue."
      exit 0
      ;;
  esac
fi

corpo=''
if [ -n "${CORPO_FICHEIRO}" ] && [ -f "${CORPO_FICHEIRO}" ]; then
  # O que cabe num ecrã bloqueado; o detalhe está no issue e na execução.
  corpo=$(head -c 900 "${CORPO_FICHEIRO}")
fi
[ -n "${corpo}" ] || corpo="Sem detalhe. Ver a execução no GitHub."

execucao=''
if [ -n "${GITHUB_SERVER_URL:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ] && [ -n "${GITHUB_RUN_ID:-}" ]; then
  execucao="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
fi

# Um cabeçalho HTTP é Latin-1: o título com acentos vai em RFC 2047, que o
# ntfy entende.
titulo_codificado="=?UTF-8?B?$(printf '%s' "${TITULO}" | base64 --wrap=0)?="

cabecalhos=(
  -H "Title: ${titulo_codificado}"
  -H "Priority: ${PRIORIDADE}"
  -H "Tags: rotating_light"
)
[ -n "${NTFY_TOKEN:-}" ] && cabecalhos+=(-H "Authorization: Bearer ${NTFY_TOKEN}")
# O rótulo da ação em ASCII: o cabeçalho `Actions` separa por vírgulas.
[ -n "${execucao}" ] && cabecalhos+=(-H "Actions: view, Ver no GitHub, ${execucao}")

# Um coletor de avisos em baixo não pode ser a razão de uma execução a vermelho:
# o que falhou já falhou, e isto é o telefonema.
if curl --silent --show-error --fail --max-time 15 \
  "${cabecalhos[@]}" \
  --data "${corpo}" \
  "${NTFY_URL}" > /dev/null; then
  echo "Aviso enviado: ${TITULO}"
else
  echo "::warning::Não deu para enviar o aviso por ntfy. O issue fica na mesma."
fi
