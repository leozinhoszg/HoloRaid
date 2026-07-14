import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validate } from '../src/common/middleware/validate';
import { errorHandler } from '../src/common/middleware/errorHandler';

function app() {
  const a = express();
  a.use(express.json());
  a.post('/echo', validate({ body: z.object({ nome: z.string().min(2) }) }), (req, res) =>
    res.json({ nome: (req.body as any).nome }));
  a.use(errorHandler);
  return a;
}

describe('validate', () => {
  it('passa payload válido', async () => {
    const res = await request(app()).post('/echo').send({ nome: 'Thiago' });
    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Thiago');
  });

  it('rejeita payload inválido com 422', async () => {
    const res = await request(app()).post('/echo').send({ nome: 'T' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION');
  });
});
