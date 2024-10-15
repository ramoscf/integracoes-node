import BasePrice from './BasePrice';

export default class Price extends BasePrice {
  private constructor(input: Price.Input) {
    super();
    Object.assign(this, input);
    return this;
  }

  static createRegularPrice(input: Price.RegularInput): Price {
    const today = new Date();
    const vlrValores = input.regularPrice.toLocaleString('pt-BR',{
        minimumFractionDigits: 2
    });
    const vlrIdcomercial = 1;
    const vlrHora = today
      .toLocaleTimeString('pt-BR', {
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
        hour12: false,
      })
      .split(' ')[0];
    const vlrDataDe = today.toISOString().split('T')[0];
    const vlrDataAte = today.toISOString().split('T')[0];
    return new Price({
      prodCod: input.prodCod,
      vlrFilial: input.vlrFilial,
      vlrIdcomercial: vlrIdcomercial,
      vlrValores: vlrValores,
      vlrDataDe: vlrDataDe,
      vlrDataAte: vlrDataAte,
      vlrHora: vlrHora,
    });
  }


  static createPromotionalPrice(input: Price.PromotionInput): Price {
    const today = new Date();
    const vlrValores = input.promotionalPrice.toLocaleString('pt-BR',{
        minimumFractionDigits: 2
    });
    const vlrIdcomercial = 1;
    const vlrHora = today
      .toLocaleTimeString('pt-BR', {
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
        hour12: false,
      })
      .split(' ')[0];
    const vlrDataDe = input.dtaInicio.toISOString().split('T')[0];
    const vlrDataAte = input.dtaFim.toISOString().split('T')[0];
    return new Price({
      prodCod: input.prodCod,
      vlrFilial: input.vlrFilial,
      vlrIdcomercial: vlrIdcomercial,
      vlrValores: vlrValores,
      vlrDataDe: vlrDataDe,
      vlrDataAte: vlrDataAte,
      vlrHora: vlrHora,
    });
  }


  static createLevePaguePrice(input: Price.LevePagueInput): Price {
    const today = new Date();

    const vlrHora = today
    .toLocaleTimeString('pt-BR', {
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
      hour12: false,
    })
    .split(' ')[0];
    const vlrDataDe = input.dtaInicio.toISOString().split('T')[0];
    const vlrDataAte = input.dtaFim.toISOString().split('T')[0];
    
    const vlrValores = input.regularPrice.concat("!@#", input.quantity.toString(), input.promotionalPrice.toLocaleString('pt-BR',{
      minimumFractionDigits: 2
  }), input.prodNome)


    return new Price({
      prodCod: input.prodCod,
      vlrFilial: input.vlrFilial,
      vlrValores: vlrValores,
      vlrDataDe: vlrDataDe,
      vlrDataAte:vlrDataAte ,
      vlrIdcomercial: 9,
      vlrHora: vlrHora,
    })
  }
}

namespace Price {
  export type Input = {
    prodCod: number;
    vlrFilial: number;
    vlrValores: string;
    vlrDataDe: string;
    vlrDataAte: string;
    vlrIdcomercial: number;
    vlrHora: string;
  };

  export type RegularInput = {
    prodCod: number;
    vlrFilial: number;
    regularPrice: number;
  };
  export type PromotionInput = {
    prodCod: number;
    vlrFilial: number;
    regularPrice?: number;
    promotionalPrice: number;
    dtaInicio: Date;
    dtaFim: Date;
  };
  export type LevePagueInput = {
    prodCod: number
    quantity: number
    regularPrice: string
    promotionalPrice: number
    prodNome: string
    vlrFilial: number
    dtaInicio: Date
    dtaFim: Date
  }
}
