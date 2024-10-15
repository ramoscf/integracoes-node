import Product from "./Product";


export default class Promotion {
  private dpData: Date;
  private dpEmpresa: number = 1;
  private dpEstabelecimento: number;
  private dpUsuario: number = 1;
  private dpHora: string;
  private dpNome: string;
  private products: Product[]
  
  

  constructor(input: Promotion.Input) {
    Object.assign(this,input)
    const today = new Date();
    this.dpHora = today
      .toLocaleTimeString('pt-BR', {
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
        hour12: false,
      })
      .split(' ')[0];
    return this;
  }


  getState(): Promotion.Output {
    return {
      dpEmpresa: this.dpEmpresa,
      dpEstabelecimento: this.dpEstabelecimento,
      dpUsuario: this.dpUsuario,
      dpData: this.dpData.toISOString().split("T")[0],
      dpHora: this.dpHora,
      dpNome: this.dpNome,
      products: this.products
    };
  }
}

namespace Promotion {
  export type Input = {
    
    dpNome: string;
    
    dpEstabelecimento: number;
    dpData: Date;
    products: Product[]
  };

  export type Output = {
    dpEmpresa: number;
    dpEstabelecimento: number;
    dpUsuario: number;
    dpData: string;
    dpHora: string;
    dpNome: string;
    products: Product[]
  };
}
