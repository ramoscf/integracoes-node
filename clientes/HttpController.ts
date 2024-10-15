import path from 'path';
import HttpServer from './shared/http/HttpServer';

export default class HttpController {
  constructor(readonly httpServer: HttpServer) {
    httpServer.on(
      'get',
      '/:cliente/:func',
      async function (params: any, body: any) {
        const cliente = params.cliente;
        const func = params.func;

        try {
          const clienteModule = require(path.join(__dirname, cliente));
          if (typeof clienteModule[func] !== 'function') {
            throw new Error(`Function ${func} not found in module ${cliente}`);
          }
          const result = await clienteModule[func]();
          console.log(result);
          return result;
        } catch (err) {

          return err;
          console.error(`Erro ao carregar o módulo para ${cliente}:`, err);
          throw new Error(`Erro ao carregar o módulo para ${cliente}`);
        }
      },
    );

    httpServer.on('get', 'test', async function (params: any, body: any) {
      try {
        throw new Error('test error');
      } catch (err) {
        console.error(`Erro ao carregar o módulo:`, err);
        throw new Error(`Erro ao carregar o módulo`);
      }
    });
  }
}
