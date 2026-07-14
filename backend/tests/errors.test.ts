import express from 'express';
import request from 'supertest';
import { ForbiddenError, AppError } from '../src/common/errors/AppError';
import { errorHandler, notFoundHandler } from '../src/common/middleware/errorHandler';

function appWith(handler: express.RequestHandler) {
  const app = express();
  app.get('/boom', handler);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('mapeia AppError para status + código', async () => {
    const app = appWith((_req, _res) => { throw new ForbiddenError('sem permissão'); });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: 'FORBIDDEN', message: 'sem permissão' } });
  });

  it('erro desconhecido vira 500 genérico sem stack', async () => {
    const app = appWith(() => { throw new Error('detalhe interno secreto'); });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL', message: 'Erro interno' } });
    expect(JSON.stringify(res.body)).not.toContain('secreto');
  });

  it('rota inexistente vira 404', async () => {
    const app = appWith((_req, res) => res.send('ok'));
    const res = await request(app).get('/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('AppError é instância de Error', () => {
    expect(new AppError(400, 'X', 'y')).toBeInstanceOf(Error);
  });
});
