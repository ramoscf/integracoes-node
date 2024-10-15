export type PromotionalComboDTO = {
  dpNome: string
  dpEstabelecimento: number
  dtaInicio: string
  dtaFim: string
  tipoPromocao: 'I' | 'G'
  tipoQuantidade: 'I' | 'T'
  items: {
    prodNome: string
    prodCod: number
    quantidade: number
    tipoItem: 'N' | 'P'
    precoItem: number
    percentualDesconto: number
  }[]
  grupos: {
    qtdItemGrupo: number
    items: {
      prodNome: string
      prodCod: number
      quantidade: number
      tipoItem: 'N' | 'P'
      precoItem: number
      percentualDesconto: number
    }[]
  }[]
  }