/**
 * Entrada serverless (Vercel).
 *
 * A aplicação continua sendo o MESMO Express de backend/server.js — nada foi
 * reescrito para a Vercel. Aqui só trocamos o `app.listen` (que não existe em
 * serverless) por um handler, garantindo que o banco seja inicializado uma vez
 * por instância antes da primeira requisição.
 *
 * Rodar localmente continua igual: `npm start` dentro de backend/.
 */
const { app, ready } = require('../backend/server');

module.exports = async (req, res) => {
  try {
    await ready();
  } catch (error) {
    console.error('Startup failed:', error.name);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ error: 'Serviço indisponível.' }));
  }
  return app(req, res);
};
