FROM node:22-slim
WORKDIR /app
COPY --chown=node:node server/oauth-broker.mjs ./server/oauth-broker.mjs
USER node
ENV HOST=0.0.0.0 PORT=8080
EXPOSE 8080
CMD ["node", "server/oauth-broker.mjs"]
