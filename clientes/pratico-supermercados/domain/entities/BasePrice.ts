export default abstract class BasePrice {
  protected vlrIdcomercial: number;
  protected vlrValores: string;
  protected vlrId: number;
  protected vlrFilial: number;
  protected prodCod: number;
  protected vlrDataDe: string;
  protected vlrDataAte: string;
  protected vlrHora: string;
  protected vlrEmpresa: number = 1;
  protected vlrUsuario: number = 1;
  protected vlrProduto: number;


  setId(id:number): void {
    this.vlrId = id
  }

  setProductId(productId: number): void {
    this.vlrProduto = productId
  }

  getState(): Price.Output {
    return {
      vlrIdcomercial: this.vlrIdcomercial,
      vlrValores: this.vlrValores,
      vlrId: this.vlrId,
      vlrFilial: this.vlrFilial,
      prodCod: this.prodCod,
      vlrDataDe: this.vlrDataDe,
      vlrDataAte: this.vlrDataAte,
      vlrHora: this.vlrHora,
      vlrEmpresa: this.vlrEmpresa,
      vlrUsuario: this.vlrUsuario,
      vlrProduto: this.vlrProduto,
    };
  }
}

namespace Price {

  export type Output = {
    vlrIdcomercial: number;
    vlrValores: string;
    vlrId?: number;
    vlrFilial: number;
    prodCod: number;
    vlrDataDe: string;
    vlrDataAte: string;
    vlrHora: string;
    vlrEmpresa: number;
    vlrUsuario: number;
    vlrProduto: number;
  };
}
