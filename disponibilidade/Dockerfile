# O serviço de disponibilidade, empacotado.
#
# A versão do Node está FIXADA, pela mesma razão do OTP e do validador: um
# runtime que se atualiza sozinho faz o comportamento mudar sem que nada no
# repositório tenha mudado. Subir é uma decisão.
#
# Não há dependências para instalar — o serviço são três ficheiros e a
# biblioteca-padrão do Node. Por isso não há `npm install`, e a imagem é
# só o runtime e o código.
FROM docker.io/library/node:22.12-alpine

WORKDIR /app
COPY analisar.mjs nucleo.mjs servidor.mjs ./

# Corre como utilizador sem privilégios: o serviço só precisa de ouvir numa
# porta e de sair para a Internet buscar uma página.
USER node

EXPOSE 8080
ENV PARAGEM_PORTA=8080
CMD ["node", "servidor.mjs"]
