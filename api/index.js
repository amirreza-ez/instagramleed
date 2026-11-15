// Vercel serverless entry: the whole NestJS API (compiled to apps/api/dist) behind /api/*.
require('../apps/api/node_modules/reflect-metadata');
let server;
module.exports = async (req, res) => {
  if (!server) {
    const { createApp } = require('../apps/api/dist/app');
    const app = await createApp();
    await app.init();
    server = app.getHttpAdapter().getInstance();
  }
  return server(req, res);
};
