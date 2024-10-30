import HttpClient from '../../../shared/http/HttpClient';
import Log from '../../../shared/log/Logger';
import { PromotionalComboDTO } from '../../domain/dtos/PromotionalComboDTO';
import Price from '../../domain/entities/Price';
import Product from '../../domain/entities/Product';
import Promotion from '../../domain/entities/Promotion';
import { ApiGateway } from './apiGateway';

interface APIPackaging {
  Status: string;
  Embalagem: string;
  CodigoAcesso: string;
}

interface ProductDivision {
  description: string;
  level: number;
}

export default class ApiGatewayHttp implements ApiGateway {
  private baseUrl: string = 'https://hs170515.consinco.cloudtotvs.com.br:8343';

  constructor(readonly client: HttpClient) {}

  async getBranches(): Promise<any> {
    const response = await this.client.get(
      `${this.baseUrl}/CadastrosEstruturaisAPI/api/v1/Empresa?Status=A`,
    );
    return response.items.map((branch) => branch.nroEmpresa);
  }

  async login(token?: string) {
    const tokenHeader = token
      ? token
      : (
          await this.client.post(`${this.baseUrl}/api/v1/auth/login`, {
            company: '1',
            username: 'VINICIUSCA',
            password: 'Carroz#v#300724',
          })
        ).access_token;

    this.client.setHeaders({
      Authorization: 'Bearer ' + tokenHeader,
      Connection: 'keep-alive',
    });
  }

  async *fetchProducts(
    pageSize: number,
  ): AsyncGenerator<Product[], void, unknown> {
    let page = 1;
    let hasNext = true;
    let limit = 0;

    while (hasNext) {
      const url = `${this.baseUrl}/CadastrosEstruturaisAPI/api/v1/Produto?Page=${page}&PageSize=${pageSize}`;

      try {
        const response = await this.client.get(`${url}`);

        const products =
          response.items.map(
            (productData: any) =>
              new Product({
                prodCod: productData.idProduto,
                prodDesc: productData.descricaoCompleta,
                prodNome:
                  productData.descricaoGenerica ||
                  productData.descricaoCompleta,
              }),
          ) || [];
        hasNext = response.hasNext;
        page += 1;
        limit = 0;
        yield products;
      } catch (error) {
        if (limit >= 3) break;
        Log.error(`Falha ao realizar request para ${url}`);
        yield [];
        limit += 1;
      }
    }
  }

  async *fetchPrices(pageSize: number): AsyncGenerator<Price[], void, unknown> {
    let page = 1;
    let limit = 0;
    while (true) {
      const url = `${this.baseUrl}/SMProdutosAPI/api/v4/produtos/precos-produtos?modelo._pageNo=${page}&modelo._pageSize=${pageSize}`;
      try {
        const response = await this.client.get(`${url}`);

        const prices = response.map((price) =>
          Price.createRegularPrice({
            prodCod: price.IdProduto,
            regularPrice: price.PrecoVenda,
            vlrFilial: price.NumeroEmpresa,
          }),
        );
        if (response.length == 0) break;

        yield prices;
        page += 1;
        limit = 0;
      } catch (error) {
        if (limit >= 3) break;
        Log.error(`Falha ao realizar request para ${url}`);
        yield [];
        limit += 1;
      }
    }
  }

  async getGtinByCode(code: number): Promise<APIPackaging[]> {
    const response = await this.client.get(
      `${this.baseUrl}/SMProdutosAPI/api/v4/produtos/embalagens-venda-produtos?idProduto=${code}`,
    );
    const res = response
      .map((res) =>
        res.Embalagens.map((pack) => {
          return {
            Status: pack.Status,
            Embalagem: pack.Embalagem,
            CodigoAcesso: pack.CodigoAcesso,
          };
        }),
      )
      .flat();
    return res;
  }

  async getDivisionByCode(code: number): Promise<ProductDivision[]> {
    const response = await this.client.get(
      `${this.baseUrl}/SMProdutosAPI/api/v4/produtos/categorias-produtos?idProduto=${code}`,
    );
    const res = response.map((category) => {
      return {
        description: category.DescricaoCategoria,
        level: category.NivelHierarquia,
      };
    });

    return res.filter((category) => category.level <= 3);
  }

  async getProductsByCode(codes?: number[]): Promise<Product[]> {
    if (!codes || codes.length == 0) return [];

    let page = 1;
    const pageSize = 500;
    let hasNext = true;
    const allProducts: Product[] = [];
    const parameters = codes
      .map((code) => {
        return `idProduto=${code}`;
      })
      .join('&');
    const url = `${this.baseUrl}/CadastrosEstruturaisAPI/api/v1/Produto?${parameters}`;

    while (hasNext) {
      const response = await this.client.get(
        `${url}&Page=${page}&PageSize=${pageSize}`,
      );

      const products = response.items.map(
        (productData) =>
          new Product({
            prodCod: productData.idProduto,
            prodDesc: productData.descricaoCompleta,
            prodNome: productData.descricaoGenerica,
          }),
      );

      allProducts.push(...products);

      hasNext = response.hasNext;
      page += 1;
    }

    return allProducts;
  }

  async getPriceByCode(code: number, branchId: number): Promise<Price | null> {
    let page = 1;
    const pageSize = 500;

    const response = await this.client.get(
      `${this.baseUrl}/SMProdutosAPI/api/v4/produtos/precos-produtos?modelo._pageNo=${page}&modelo._pageSize=${pageSize}&modelo.idProduto=${code}&modelo.nroEmpresa=${branchId}`,
    );

    if (response.length == 0) return null;

    const price = Price.createRegularPrice({
      prodCod: response[0].IdProduto,
      regularPrice: response[0].PrecoVenda,
      vlrFilial: response[0].NumeroEmpresa,
    });
    return price;
  }

  async getAllProducts(): Promise<Product[]> {
    let page = 1;
    const pageSize = 500;
    let hasNext = true;
    const allProducts: Product[] = [];
    const today = new Date().toISOString().split('T')[0];

    while (hasNext) {
      const response = await this.client.get(
        `${this.baseUrl}/CadastrosEstruturaisAPI/api/v1/Produto?Page=${page}&PageSize=${pageSize}&DataHoraAlteracao=${today}`,
      );

      const products = response.items.map(
        (productData) =>
          new Product({
            prodCod: productData.idProduto,
            prodDesc: productData.descricaoCompleta,
            prodNome: productData.descricaoGenerica,
          }),
      );

      allProducts.push(...products);

      hasNext = response.hasNext;
      page += 1;
    }
    
    return allProducts;
  }

  async getAllPrices(): Promise<Price[]> {
    const today = new Date().toISOString().split('T')[0].concat('T00:00:00');
    let page = 1;
    const pageSize = 500;
    const allPrices: Price[] = [];

    while (true) {
      const response = await this.client.get(
        `${this.baseUrl}/SMProdutosAPI/api/v4/produtos/precos-produtos?modelo._pageNo=${page}&modelo._pageSize=${pageSize}&modelo.dataAtualizacao=${today}`,
      );

      if (response.length == 0) break;

      const prices = response.map((price) =>
        Price.createRegularPrice({
          prodCod: price.IdProduto,
          regularPrice: price.PrecoVenda,
          vlrFilial: price.NumeroEmpresa,
        }),
      );
      allPrices.push(...prices);
      page += 1;
    }
    return allPrices;
  }

  async getPromotions(): Promise<Promotion[]> {
    let page = 1;
    const pageSize = 500;
    let hasNext = true;
    const allPromotions: Promotion[] = [];

    while (hasNext) {
      const response = await this.client.get(
        `${this.baseUrl}/PromocaoAPI/api/v1/Promocao?Page=${page}&PageSize=${pageSize}&Vigente=S&Status=A`,
      );

      const promotions = response.items
        .map((promotion) => {
          return promotion.empresas.map((branch) => {
            return new Promotion({
              dpNome: promotion.descricao,
              dpEstabelecimento: branch.nroEmpresa,
              dpData: new Date(promotion.dtaHoraInclusao),
              products: promotion.produtos.map((product) => {
                return new Product({
                  prodCod: product.seqProduto,
                  prodNome: product.descricaoCompleta,
                  prodDesc: product.descricaoCompleta,
                  prodSku: product.codAcesso,
                  prices: [
                    Price.createPromotionalPrice({
                      prodCod: product.seqProduto,
                      dtaInicio: new Date(promotion.dtaInicio),
                      dtaFim: new Date(promotion.dtaFim),
                      promotionalPrice: product.precoPromocional,
                      vlrFilial: branch.nroEmpresa,
                    }),
                  ],
                });
              }),
            });
          });
        })
        .flat();

      allPromotions.push(...promotions);

      hasNext = response.hasNext;
      page += 1;
    }

    return allPromotions;
  }

  async getPromotionsLevePague(branchId: number): Promise<PromotionalComboDTO[]> {
    let page = 1;
    const pageSize = 500;
    let hasNext = true;
    const allPromotions: PromotionalComboDTO[] = [];

    while (hasNext) {
      const response = await this.client.get(
      //  `${this.baseUrl}/SMPromocoesAPI/api/v1/CombosPromocionais?Page=${page}&PageSize=${pageSize}&NroEmpresa=${branchId}`,
       `${this.baseUrl}/SMPromocoesAPI/api/v1/CombosPromocionais?Page=${page}&PageSize=${pageSize}&Vigente=S&Status=A&NroEmpresa=${branchId}`,
      );

      const promotions: PromotionalComboDTO[] = response.items
        .map((promotion) => {
            return {
              dpNome: promotion.descricao,
              dpEstabelecimento: branchId,
              dtaInicio: promotion.dataInicio,
              dtaFim: promotion.dataFim,
              tipoPromocao: promotion.tipoPromocao,
              tipoQuantidade: promotion.tipoQuantidade,
              items: promotion.itens.map((item) => {
                return {
                  prodNome: item.produto.descricaoCompleta,
                  prodCod: item.seqProduto,
                  quantidade: item.quantidade,
                  tipoItem: item.tipoItem,
                  precoItem: item.precoItem,
                  percentualDesconto: item.percentualDesconto,
                };
              }),
              grupos: promotion.grupos.map(group=> {
                return {
                qtdItemGrupo: group.qtdItemGrupo,
                items: group.itens.map((item) => {
                  return {
                    prodNome: item.produto.descricaoCompleta,
                    prodCod: item.seqProduto,
                    quantidade: item.quantidade,
                    tipoItem: item.tipoItem,
                    precoItem: item.precoItem,
                    percentualDesconto: item.percentualDesconto,
                  };
                }),
              }}),
            };
          
        })
        .flat();

      allPromotions.push(...promotions);

      hasNext = response.hasNext;
      page += 1;
    }

    return allPromotions;
  }
}
