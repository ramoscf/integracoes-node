import axios from 'axios';
import { ApiGateway } from './apiGateway';
import HttpClient from '../../../shared/http/HttpClient';
import Product from '../../domain/entities/Product';
import Price from '../../domain/entities/Price';
import moment from 'moment';

export default class ApiGatewayHttp implements ApiGateway {
  private baseUrl: string = 'http://gamerica.dyndns.info:8010';

  constructor(readonly client: HttpClient) {}
  async getBranches(): Promise<number[]> {
    const response = await this.client.get(`${this.baseUrl}/v1.5/unidades`);
    return response.response.unidades.map((branch) => branch.Codigo);
  }

  async login(token?: string) {
    let tokenHeader;
    if (!token) {
      tokenHeader = await this.client.post(`${this.baseUrl}/v1.1/auth`, {
        usuario: '100051',
        senha: 'cArtaz@321',
      });
      tokenHeader = tokenHeader.response.token;
    } else {
      tokenHeader = token;
    }
    
    this.client.setHeaders({
      token: tokenHeader,
      Connection: 'keep-alive',
    });
  }

  async *getAlteredProducts(    branchId: number,
  ): AsyncGenerator<Product[], void, unknown> {
    let lastId = 0;
    const date = new Date().toLocaleDateString('pt-BR').replace(/\//g,"-").concat(' 00:00:00');

    while (true) {
      const response = await this.client.get(
        `${this.baseUrl}/v2.8/produtounidade/listaprodutos/${lastId}/unidade/${branchId}/detalhado/ativos/dataHoraManutencao/${date}`,
      );

      const products: Product[] = response.response.produtos.map(
        (productData) => {
          const prices: Price[] = [];
          prices.push(
            Price.createRegularPrice({
              prodCod: productData.Codigo,
              vlrFilial: branchId,
              regularPrice: productData.Preco,
            }),
          );
          if (productData.Oferta === 'S') {
            prices.push(
              Price.createPromotionalPrice({
                prodCod: productData.Codigo,
                vlrFilial: branchId,
                regularPrice: productData.PrecoNormal,
                promotionalPrice: productData.Preco,
                dtaInicio: moment(
                  productData.DataOferta,
                  'DD/MM/YYYY',
                ).toDate(),
                dtaFim: moment(productData.DataOferta, 'DD/MM/YYYY').toDate(),
              }),
            );
          }
          return new Product({
            prodCod: productData.Codigo,
            prodSku: productData.CodigoBarras,
            prodNome: productData.Descricao,
            prodDesc: productData.Descricao,
            prodProporcao: productData.TipoEmbalagem,
            prices: prices.filter(
              (price) => price.getState().vlrValores != '0,00',
            ),
          });
        },
      );

      if (response.response.produtos.length == 0) break;

      yield products;

      lastId = products[products.length - 1].getState().prodCod;
    }
  }


    async *getAllProducts(
    branchId: number,
  ): AsyncGenerator<Product[], void, unknown> {
    let lastId = 0;

    while (true) {
      const response = await this.client.get(
        `${this.baseUrl}/v2.8/produtounidade/listaprodutos/${lastId}/unidade/${branchId}/detalhado/ativos`,
      );

      const products: Product[] = response.response.produtos.map(
        (productData) => {
          const prices: Price[] = [];
          prices.push(
            Price.createRegularPrice({
              prodCod: productData.Codigo,
              vlrFilial: branchId,
              regularPrice: productData.Preco,
            }),
          );
          if (productData.Oferta === 'S') {
            prices.push(
              Price.createPromotionalPrice({
                prodCod: productData.Codigo,
                vlrFilial: branchId,
                regularPrice: productData.PrecoNormal,
                promotionalPrice: productData.Preco,
                dtaInicio: moment(
                  productData.DataOferta,
                  'DD/MM/YYYY',
                ).toDate(),
                dtaFim: moment(productData.DataOferta, 'DD/MM/YYYY').toDate(),
              }),
            );
          }
          return new Product({
            prodCod: productData.Codigo,
            prodSku: productData.CodigoBarras,
            prodNome: productData.Descricao,
            prodDesc: productData.Descricao,
            prodProporcao: productData.TipoEmbalagem,
            prices: prices.filter(
              (price) => price.getState().vlrValores != '0,00',
            ),
          });
        },
      );

      if (response.response.produtos.length == 0) break;

      yield products;

      lastId = products[products.length - 1].getState().prodCod;
    }
  }
}
