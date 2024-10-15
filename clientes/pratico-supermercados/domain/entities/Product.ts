// interface APIProduct {
//   idProduto: number;
//   descricaoCompleta: string;
//   descricaoGenerica: string;
//   Pesavel: 'S' | 'N';
// }

import Price from './Price';

export default class Product {
  private prodCod: number;
  private prodNome: string;
  private prodDesc: string;
  private prodSku: string;
  private prodProporcao: string;
  private prodEmpresa: number = 1;
  private prodEstabelecimento: number = 1;
  private prodFlag100g: string = '';
  private prices: Price[] = [];
  private prodSessao: string = '' 

  constructor(input: Partial<Product.Input>) {
    Object.assign(this, input);
    return this;
  }

  setProportion(proportion: string): void {
    this.prodProporcao = proportion;
  }

  setGtins(gtins: string): void {
    this.prodSku = gtins;
  }

  setProdSessao(prodSessao: string): void {
    this.prodSessao = prodSessao;
  }

  setCategories(input: {
    prodSessao: string;
    prodGrupo: string;
    prodSubgrupo: string;
  }) {
    Object.assign(this, input);
  }

  setPrices(prices: Price[]): void {
    this.prices = prices;
  }
  addPrices(prices: Price[]): void {
    prices.map((price) => this.prices.push(price));
  }

  getState(): Product.Output {
    return {
      prodSessao: this.prodSessao,
      prodCod: this.prodCod,
      prodNome: this.prodNome,
      prodDesc: this.prodDesc,
      prodSku: this.prodSku,
      prodProporcao: this.prodProporcao,
      prodEmpresa: this.prodEmpresa,
      prodEstabelecimento: this.prodEstabelecimento,
      prodFlag100g: this.prodFlag100g,
      prices: this.prices,
    };
  }
}

namespace Product {
  export type Input = {
    prodCod: number;
    prodNome: string;
    prodDesc: string;
    prodSessao: string,
    prodSku: string;
    prodProporcao: string;
    prices: Price[];
  };

  export type Output = {
    prodCod: number;
    prodSessao: string,
    prodNome: string;
    prodDesc: string;
    prodSku: string;
    prodProporcao: string;
    prodEmpresa: number;
    prodEstabelecimento: number;
    prodFlag100g: string;
    prices: Price[];
  };
}
