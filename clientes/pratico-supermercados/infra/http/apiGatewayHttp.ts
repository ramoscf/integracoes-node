import axios from 'axios';
import { ApiGateway } from './apiGateway';
import HttpClient from '../../../shared/http/HttpClient';
import Product from '../../domain/entities/Product';
import Price from '../../domain/entities/Price';
import moment from 'moment';
import Log from '../Logger';
import Promotion from '../../domain/entities/Promotion';
import { ProductDivision } from '../../domain/dtos/CategoryDTO';
import { APIPackaging } from '../../domain/dtos/PackageDTO';

export default class ApiGatewayHttp implements ApiGateway {
  private baseUrl: string = 'http://pratico.dyndns-ip.com:9000';

  constructor(readonly client: HttpClient) { }
  async getBranches(): Promise<number[]> {
    const response = await this.client.get(`${this.baseUrl}/v1.5/unidades`);
    return response.response.unidades.map((branch) => branch.Codigo);
  }

  async login(token?: string) {
    let tokenHeader;
    if (!token) {
      tokenHeader = await this.client.post(`${this.baseUrl}/v1.1/auth`, {
        usuario: '100044',
        senha: '1278159515',
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

  async *getAlteredProducts(
    branchId: number,
  ): AsyncGenerator<Product[], void, unknown> {
    let lastId = 0;
    let limit = 0;
    const date = new Date()
      .toLocaleDateString('pt-BR')
      .replace(/\//g, '-')
      .concat(' 00:00:00');


    while (true) {
      let url = `${this.baseUrl}/v2.8/produtounidade/listaprodutos/${lastId}/unidade/${branchId}/detalhado/ativos/dataHoraManutencao/${date}`;
      try {
        const response = await this.client.get(`${url}`);



        const products: Product[] = response.response.produtos.map(
          (productData) => {

            //console.log(productData)
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
              prodSessao: productData.Departamento,
              prices: prices.filter(
                (price) => price.getState().vlrValores != '0,00',
              ),
            });
          },
        );

        if (response.response.produtos.length == 0) break;

        yield products;

        lastId = products[products.length - 1].getState().prodCod;
        limit = 0;
      } catch (error) {
        Log.error(`Erro ao fazer requisição para ${url} ${error}`);
        limit += 1;
        if (limit >= 3) break;
      }
    }
  }


  async *getAlteredProductsApenasOferta(
    branchId: number,
  ): AsyncGenerator<Product[], void, unknown> {
    let lastId = 0;
    let limit = 0;
    const date = new Date()
      .toLocaleDateString('pt-BR')
      .replace(/\//g, '-')
      .concat(' 00:00:00');


    while (true) {
      let url = `${this.baseUrl}/v2.8/produtounidade/listaprodutos/${lastId}/unidade/${branchId}/detalhado/ativos/dataHoraManutencao/${date}`;
      try {
        const response = await this.client.get(`${url}`);



        const products: Product[] = response.response.produtos.map(
          (productData) => {


            const today = new Date();
            const formattedDate = today.toISOString().split('T')[0];
            const resultString = `Ofertas de hoje ${formattedDate}.`;

            let dp_dgcartaz;
            let dp_dgmotivo;
            let dp_tamanho = '210/148'; // Tamanho fixo
            let dp_fortam = 'A5 PAISAGEM'; // Formato fixo

            if (productData.Departamento == 'Hortifruti') {
              dp_dgcartaz = 60;
              dp_dgmotivo = 48;
            } else {
              dp_dgcartaz = 72;
              dp_dgmotivo = 64;
            }

            return {
              prodCod: productData.Codigo,
              dp_estabelecimento:  branchId,
              dp_empresa: 1,
              dp_usuario: 1,
              dp_data: moment(
                productData.DataOferta,
                'DD/MM/YYYY',
              ).toDate(),
              dp_nome: resultString,
              dp_mobile: 0,
              dp_qntparcela: 1,
              dp_idtaxa: 'sjuros',
              dp_auditoria: 0,
              dp_dgcartaz: dp_dgcartaz,
              dp_dgmotivo: dp_dgmotivo,
              dp_tamanho: dp_tamanho,
              dp_fortam: dp_fortam,
              create: true,
              oferta: productData.Oferta,


            };


          },
        );

        if (response.response.produtos.length == 0) break;

        yield products;

        lastId = response.response.produtos.pop().Codigo;
        limit = 0;
      } catch (error) {
        Log.error(`Erro ao fazer requisição para ${url} ${error}`);
        limit += 1;
        if (limit >= 3) break;
      }
    }
  }

  async *getAllProducts(
    branchId: number,
  ): AsyncGenerator<Product[], void, unknown> {
    let lastId = 0;
    let limit = 0;

    while (true) {
      let url = `${this.baseUrl}/v2.8/produtounidade/listaprodutos/${lastId}/unidade/${branchId}/detalhado/ativos`;
      try {
        const response = await this.client.get(`${url}`);

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
              prodSessao: productData.Departamento,
              prices: prices.filter(
                (price) => price.getState().vlrValores != '0,00',
              ),
            });
          },
        );

        if (response.response.produtos.length == 0) break;

        yield products;

        lastId = products[products.length - 1].getState().prodCod;
        limit = 0;
      } catch (error) {
        Log.error(`Erro ao fazer requisição para ${url} ${error}`);
        limit += 1;
        if (limit >= 3) break;
      }
    }
  }







}
