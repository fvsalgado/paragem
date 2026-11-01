#!/usr/bin/env bash
# O poppler que lê o caderno de horários, instalado e conferido.
#
# A VERSÃO ESTÁ FIXADA, e é por isto: a saída de `pdftotext -layout` muda
# entre versões do poppler, e é contra ela que se conferem as contagens do
# caderno (linhas, blocos, viagens). Uma atualização silenciosa mudava os
# números sem que nada no repositório tivesse mudado — e o docs/ARQUITETURA.md
# dizia que estava fixada quando os fluxos o instalavam sem versão nenhuma.
#
# Fixa-se em dois sítios que têm de dizer o mesmo: a imagem do executor
# (`runs-on: ubuntu-24.04`, e não `ubuntu-latest`, que muda de versão do
# sistema por baixo dos pés) e o POPPLER_ESPERADO aqui em baixo, que é o que o
# arquivo dessa imagem traz. O apt não fixa a versão do pacote: a revisão de
# segurança muda e a versão exata deixa de existir no arquivo, e o fluxo
# partia por isso. O que se confere é a versão do poppler, que é a que muda a
# saída.
#
#   scripts/poppler.sh            instala e REPROVA se a versão for outra
#   scripts/poppler.sh --avisar   instala e só avisa (para os testes, que
#                                 reprovam sozinhos se as contagens mudarem)
#
# Os outros pacotes de sistema que o fluxo precisar vão como argumentos
# (`scripts/poppler.sh osmium-tool`), para ficar um `apt-get` só.
set -euo pipefail

POPPLER_ESPERADO="${POPPLER_ESPERADO:-24.02}"

so_avisar=false
pacotes=(poppler-utils)
for a in "$@"; do
  case "$a" in
    --avisar) so_avisar=true ;;
    *) pacotes+=("$a") ;;
  esac
done

sudo apt-get update -qq
sudo apt-get install -y -qq "${pacotes[@]}"

versao="$(pdftotext -v 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1)"
echo "poppler $versao (esperado $POPPLER_ESPERADO)"
if [ "$versao" != "$POPPLER_ESPERADO" ]; then
  msg="poppler $versao, esperado $POPPLER_ESPERADO — a saída de -layout muda entre versões; reconferir as contagens do caderno antes de mudar o POPPLER_ESPERADO."
  if $so_avisar; then
    echo "::warning::$msg"
  else
    echo "::error::$msg"
    exit 1
  fi
fi
