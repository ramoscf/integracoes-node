import { DataSource, QueryRunner } from 'typeorm';
import ApiGatewayHttp from '../infra/http/apiGatewayHttp';
import Product from '../domain/entities/Product';
import Price from '../domain/entities/Price';
import Promotion from '../domain/entities/Promotion';
import AxiosAdapter from '../../shared/http/AxiosAdapter';
import MysqlTypeOrmAdapter from '../infra/database/MysqlTypeOrmAdapter';
import { PromotionalComboDTO } from '../domain/dtos/PromotionalComboDTO';
import { CfProdutoEntity } from '../infra/database/mapping/CfProduto';
import Log from '../infra/Logger';
import { CfDailyprintEntity } from '../infra/database/mapping/CfDailyprint';
import { ProductDivision } from '../domain/dtos/CategoryDTO';
import { CfValorEntity } from '../infra/database/mapping/CfValor';

interface APIPackaging {
  Status: string;
  Embalagem: string;
  CodigoAcesso: string;
}

type ProductInfoMap = {
  [key: number]: {
    prod_id: number;
    prod_sessao: string;
    prices: {
      vlr_id: number;
      vlr_filial: number;
      vlr_idcomercial: number;
      vlr_valores: string;
    }[];
  };
};

const client = new AxiosAdapter();
const apiGateway = new ApiGatewayHttp(client);

const getDailyprintInfo = (
  vlrIdcomercial: number,
  prodSessao?: string,
): {
  dpDgcartaz: number;
  dpDgmotivo: number;
  dpFortam: string;
  dpTamanho: string;
} => {
  switch (vlrIdcomercial) {
    case 1:
      if (prodSessao == 'HORTIFRUTI') {
        return {
          dpDgcartaz: 76,
          dpDgmotivo: 49,
          dpFortam: 'A5 Paisagem',
          dpTamanho: '210/148',
        };
      }
      return {
        dpDgcartaz: 78,
        dpDgmotivo: 51,
        dpFortam: 'A6 Paisagem',
        dpTamanho: '148/105',
      };

    case 2:
      return {
        dpDgcartaz: 42,
        dpDgmotivo: 24,
        dpFortam: 'A6 PAISAGEM',
        dpTamanho: '148/105',
      };
    case 5:
      return {
        dpDgcartaz: 98,
        dpDgmotivo: 53,
        dpFortam: 'A6 PAISAGEM',
        dpTamanho: '148/105',
      };
    case 8:
      return {
        dpDgcartaz: 119,
        dpDgmotivo: 50,
        dpFortam: 'A6 RETRATO',
        dpTamanho: '105/148',
      };
    default:
      return {
        dpDgcartaz: 78,
        dpDgmotivo: 51,
        dpFortam: 'A6 PAISAGEM',
        dpTamanho: '148/105',
      };
  }
};


// Função para buscar filiais
const fetchBranches = async (): Promise<number[]> => {
  const response = await apiGateway.getBranches();
  return response;
};


const transformProduct = (
  record: Product,
  gtinData: APIPackaging[],
  categoryData: ProductDivision[],
): Product => {
  const gtins = new Set(
    gtinData.reduce((acc, pack) => {
      if (pack.CodigoAcesso) {
        acc.push(pack.CodigoAcesso.trim());
      }
      return acc;
    }, [] as string[]),
  );
  record.setGtins([...gtins].join(','));
  record.setProportion(gtinData[0].Embalagem);
  record.setCategories({
    prodSessao:
      categoryData.find((category) => category.level == 1)?.description || '',
    prodGrupo:
      categoryData.find((category) => category.level == 2)?.description || '',
    prodSubgrupo:
      categoryData.find((category) => category.level == 3)?.description || '',
  });
  return record;
};


const transformPromotion = (
  promotion: PromotionalComboDTO,
  products: ProductInfoMap,
): Promotion | null => {
  if (promotion.tipoPromocao === 'I') {
    const baseItem = promotion.items.find((el) => el.tipoItem == 'N');
    const promotionalItem = promotion.items.find((el) => el.tipoItem === 'P');
    if (!baseItem || !promotionalItem) return null;
    if (promotionalItem.precoItem > 0) {
      const basePrice = products[baseItem.prodCod].prices.find(
        (el) =>
          el.vlr_idcomercial == 1 &&
          el.vlr_filial == promotion.dpEstabelecimento,
      );
      if (!basePrice) return null;

      const price = Price.createLevePaguePrice({
        prodCod: baseItem.prodCod,
        quantity: baseItem.quantidade,
        regularPrice: basePrice.vlr_valores.split('!@#')[0],
        promotionalPrice: promotionalItem.precoItem,
        prodNome: promotionalItem.prodNome,
        dtaInicio: new Date(promotion.dtaInicio),
        dtaFim: new Date(promotion.dtaFim),
        vlrFilial: promotion.dpEstabelecimento,
      });

      return new Promotion({
        dpNome: promotion.dpNome,
        dpEstabelecimento: promotion.dpEstabelecimento,
        dpData: new Date(promotion.dtaInicio),
        products: [
          new Product({
            prodCod: baseItem.prodCod,
            prices: [price],
          }),
        ],
      });
    } else if (promotionalItem.percentualDesconto > 0) {
      const baseItemPrice = products[baseItem.prodCod].prices.find(
        (el) =>
          el.vlr_idcomercial == 1 &&
          el.vlr_filial == promotion.dpEstabelecimento,
      );

      const promotionalItemPrice = products[
        promotionalItem.prodCod
      ].prices.find(
        (el) =>
          el.vlr_idcomercial == 1 &&
          el.vlr_filial == promotion.dpEstabelecimento,
      );
      if (!baseItemPrice || !promotionalItemPrice) return null;

      const price = Price.createLevePaguePrice({
        prodCod: baseItem.prodCod,
        quantity: baseItem.quantidade,
        regularPrice: baseItemPrice.vlr_valores.split('!@#')[0],
        promotionalPrice:
          parseFloat(promotionalItemPrice.vlr_valores.replace(',', '.')) *
          promotionalItem.percentualDesconto,
        prodNome: promotionalItem.prodNome,
        dtaInicio: new Date(promotion.dtaInicio),
        dtaFim: new Date(promotion.dtaFim),
        vlrFilial: promotion.dpEstabelecimento,
      });

      return new Promotion({
        dpNome: promotion.dpNome,
        dpEstabelecimento: promotion.dpEstabelecimento,
        dpData: new Date(promotion.dtaInicio),
        products: [
          new Product({
            prodCod: baseItem.prodCod,
            prices: [price],
          }),
        ],
      });
    }
  } else {
    if (promotion.tipoQuantidade === 'I') {
      const promotionalProducts: Product[] = [];
      for (const group of promotion.grupos) {
        const baseItem = group.items.find((el) => el.tipoItem == 'N');
        const promotionalItem = group.items.find((el) => el.tipoItem === 'P');
        if (!baseItem || !promotionalItem) continue;
        if (promotionalItem.precoItem > 0) {
          const basePrice = products[baseItem.prodCod].prices.find(
            (el) =>
              el.vlr_idcomercial == 1 &&
              el.vlr_filial == promotion.dpEstabelecimento,
          );
          if (!basePrice) continue;

          const price = Price.createLevePaguePrice({
            prodCod: baseItem.prodCod,
            quantity: baseItem.quantidade,
            regularPrice: basePrice.vlr_valores.split('!@#')[0],
            promotionalPrice: promotionalItem.precoItem,
            prodNome: promotionalItem.prodNome,
            dtaInicio: new Date(promotion.dtaInicio),
            dtaFim: new Date(promotion.dtaFim),
            vlrFilial: promotion.dpEstabelecimento,
          });

          // return new Promotion({
          //   dpNome: promotion.dpNome,
          //   dpEstabelecimento: promotion.dpEstabelecimento,
          //   dpData: new Date(promotion.dtaInicio),
          //   products: [
          promotionalProducts.push(
            new Product({
              prodCod: baseItem.prodCod,
              prices: [price],
            }),
          );
        }
      }
      if (promotionalProducts.length == 0) return null;
      return new Promotion({
        dpNome: promotion.dpNome,
        dpEstabelecimento: promotion.dpEstabelecimento,
        dpData: new Date(promotion.dtaInicio),
        products: promotionalProducts,
      });
    } else {
      const promotionalProducts: Product[] = [];
      for (const group of promotion.grupos) {
        const quantity = group.qtdItemGrupo;
        const baseItem = group.items.find((el) => el.tipoItem == 'N');
        const promotionalItems = group.items.filter(
          (el) => el.tipoItem === 'P',
        );
        if (!baseItem || promotionalItems.length == 0) continue;
        const basePrice = products[baseItem.prodCod].prices.find(
          (el) =>
            el.vlr_idcomercial == 1 &&
            el.vlr_filial == promotion.dpEstabelecimento,
        );
        if (!basePrice) continue;

        for (const promotionalItem of promotionalItems) {
          if (promotionalItem.precoItem > 0) {
            const price = Price.createLevePaguePrice({
              prodCod: baseItem.prodCod,
              quantity: quantity,
              regularPrice: basePrice.vlr_valores.split('!@#')[0],
              promotionalPrice: promotionalItem.precoItem,
              prodNome: promotionalItem.prodNome,
              dtaInicio: new Date(promotion.dtaInicio),
              dtaFim: new Date(promotion.dtaFim),
              vlrFilial: promotion.dpEstabelecimento,
            });

            promotionalProducts.push(
              new Product({
                prodCod: baseItem.prodCod,
                prices: [price],
              }),
            );
          }
        }
      }
      if (promotionalProducts.length == 0) return null;
      return new Promotion({
        dpNome: promotion.dpNome,
        dpEstabelecimento: promotion.dpEstabelecimento,
        dpData: new Date(promotion.dtaInicio),
        products: promotionalProducts,
      });
    }
  }

  return null;
};

// Função para buscar filiais
const fetchPromotions = async (branchId: number): Promise<PromotionalComboDTO[]> => {
  const response = await apiGateway.getPromotionsLevePague(branchId);
  return response;
};

// Função para buscar detalhes de um produto específico na API
const fetchProducts = async (codes: number[]): Promise<Product[]> => {
  const response = await apiGateway.getProductsByCode(codes);
  return response;
};

const fetchPriceByCode = async (
  code: number,
  branchId: number,
): Promise<Price | null> => {
  const response = await apiGateway.getPriceByCode(code, branchId);
  return response;
};

const fetchProductGtins = async (code: number): Promise<APIPackaging[]> => {
  //const today = moment().format('DD/MM/YYYY');
  const response = await apiGateway.getGtinByCode(code);
  return response;
};


const fetchProductCategory = async (
  code: number,
): Promise<ProductDivision[]> => {
  const response = await apiGateway.getDivisionByCode(code);
  return response;
};


// Função para verificar quais produtos já existem no banco de dados
const checkIfProductsExist = async (
  queryRunner: QueryRunner,
  prodCodes: number[],
): Promise<ProductInfoMap> => {
  const rows = await queryRunner.manager.query(
    'SELECT p.prod_cod, p.prod_sessao, p.prod_id, v.vlr_id, v.vlr_filial, v.vlr_idcomercial, v.vlr_valores FROM cf_produto p LEFT JOIN cf_valor v on p.prod_id = v.vlr_produto WHERE prod_cod IN (?)',
    [prodCodes],
  );
  const productsMap: ProductInfoMap = {};
  rows.forEach((row: any) => {
    const prod_cod = parseInt(row.prod_cod);
    const prod_id = parseInt(row.prod_id);
    const prod_sessao = row.prod_sessao;
    const vlr_id = parseInt(row.vlr_id);
    const vlr_filial = parseInt(row.vlr_filial);
    const vlr_idcomercial = parseInt(row.vlr_idcomercial);
    const vlr_valores = row.vlr_valores;
    if (vlr_id) {
      if (!productsMap[prod_cod])
        productsMap[prod_cod] = {
          prod_id,
          prod_sessao,
          prices: [{ vlr_id, vlr_filial, vlr_idcomercial, vlr_valores }],
        };
      else
        productsMap[prod_cod].prices.push({
          vlr_id,
          vlr_filial,
          vlr_idcomercial,
          vlr_valores,
        });
    } else {
      if (!productsMap[prod_cod])
        productsMap[prod_cod] = { prod_id, prod_sessao,prices: [] };
    }
  });
  return productsMap;
};

// Função para inserir novos produtos
const insertProducts = async (
  queryRunner: QueryRunner,
  products: Product[],
): Promise<void> => {
  if (products.length === 0) return;

  const entities = queryRunner.manager.create(
    CfProdutoEntity,
    products.map((product) => product.getState()),
  );
  await queryRunner.manager.insert(CfProdutoEntity, entities);
};

const insertPrices = async (
  queryRunner: QueryRunner,
  records: Price[],
): Promise<void> => {
  if (records.length === 0) return;
  try {
    const entities = queryRunner.manager.create(
      CfValorEntity,
      records.map((price) => price.getState()),
    );
    await queryRunner.manager.insert(CfValorEntity, entities);

  } catch (error) {
    Log.error(
      'Create Promotions LevePague: não foi possível inserir os preços ' +
        error +
        '\nPreços:',
      records,
      'database-error',
    );
    throw error;
  }
};

const updatePrices = async (
  queryRunner: QueryRunner,
  records: Price[],
): Promise<void> => {
  if (records.length === 0) return;

  try {
    const ids = records.map((record) => {
      Log.info('Create Promotions LevePague: atualizando produto', record);
      return record.getState().vlrId;
    });

    const updateDataDe = records
      .map(
        (record) =>
          `WHEN ${record.getState().vlrId} THEN '${record.getState().vlrDataDe}'`,
      )
      .join(' ');
    const updateDataAte = records
      .map(
        (record) =>
          `WHEN ${record.getState().vlrId} THEN '${record.getState().vlrDataAte}'`,
      )
      .join(' ');
    const updateValores = records
      .map(
        (record) =>
          `WHEN ${record.getState().vlrId} THEN '${record.getState().vlrValores}'`,
      )
      .join(' ');
    const updateHora = records
      .map(
        (record) =>
          `WHEN ${record.getState().vlrId} THEN '${record.getState().vlrHora}'`,
      )
      .join(' ');

    const query = `
    UPDATE cf_valor
    SET
      vlr_data_de = CASE vlr_id ${updateDataDe} END,
      vlr_data_ate = CASE vlr_id ${updateDataAte} END,
      vlr_valores = CASE vlr_id ${updateValores} END,
      vlr_hora = CASE vlr_id ${updateHora} END 
    WHERE vlr_id IN (${ids.join(', ')})
  `;

    await queryRunner.query(query);
  } catch (error) {
    Log.error(
      'Create Promotions LevePague: não foi possível atualizar os preços' +
        error +
        '\nPreços:',
      records,
      'database-error',
    );
    throw error;
  }
};

const processProductsBatch = async (
  queryRunner: QueryRunner,
  codes: number[],
) => {
  if (codes.length <= 0) return;

  try {
    const products = await fetchProducts(codes);
    const gtinsAndCategories = await Promise.all(
      codes.map(async (code) => {
        const gtinData = await fetchProductGtins(code);
        const categoryData = await fetchProductCategory(code);
        return { code, gtinData, categoryData };
      }),
    );

    const gtinsMap: {
      [code: number]: {
        gtinData: APIPackaging[];
        categoryData: ProductDivision[];
      };
    } = gtinsAndCategories.reduce(
      (acc, result) => {
        acc[result.code] = {
          gtinData: result.gtinData,
          categoryData: result.categoryData,
        };
        return acc;
      },
      {} as {
        [code: number]: {
          gtinData: APIPackaging[];
          categoryData: ProductDivision[];
        };
      },
    );

    const transformedProducts = products.map((product) =>
      transformProduct(
        product,
        gtinsMap[product.getState().prodCod].gtinData,
        gtinsMap[product.getState().prodCod].categoryData,
      ),
    );

    await insertProducts(queryRunner, transformedProducts);
    console.log('[CASA-DO-ARROZ] :: CreatePromotionsLevePague :: Produtos Faltantes processados com sucesso!');
  } catch (err) {
    console.error('[CASA-DO-ARROZ] :: CreatePromotionsLevePague :: Erro ao criar produtos faltantes:', err);
    throw new Error(`[CASA-DO-ARROZ] :: CreatePromotionsLevePague :: Erro ao criar produtos faltantes: ${err}`);
  }
};

const processMissingPricesBatch = async (
  queryRunner: QueryRunner,
  branchId: number,
  codes: number[],
) => {
  if (codes.length <= 0) return;


  try {
    const productsMissingPrices: Price[] = [];
    for (const code of codes) {
        const price = await fetchPriceByCode(code, branchId);
        if (price) productsMissingPrices.push(price);
    }
    if (productsMissingPrices.length > 0) {
      await insertPrices(queryRunner, productsMissingPrices);
    }
  } catch (error) {
    console.error('[CASA-DO-ARROZ] :: CreatePromotionsLevePague :: Erro ao criar produtos faltantes:', error);
    throw new Error(`[CASA-DO-ARROZ] :: CreatePromotionsLevePague :: Erro ao criar preços faltantes: ${error}`);
  }
};

const processPricesBatch = async (
  queryRunner: QueryRunner,
  branchId: number,
  prices: Price[],
  products: ProductInfoMap,
) => {
  if (prices.length <= 0) return;

  try {
    const { newPrices, existingPrices } = prices.reduce(
      (acc, price, index) => {
        try {
          if (products[price.getState().prodCod] === undefined) {
            Log.error(`Create Promotions LevePague: falha ao buscar produto `, price);
            return acc;
          }
          const existingPrice = products[
            price.getState().prodCod
          ].prices.filter(
            (p) =>
              p.vlr_filial == branchId &&
              p.vlr_idcomercial == price.getState().vlrIdcomercial,
          );
          if (existingPrice.length !== 0) {
            price.setId(existingPrice[0].vlr_id);
            price.setProductId(products[price.getState().prodCod].prod_id);
            acc.existingPrices.push(price);
          } else {
            price.setProductId(products[price.getState().prodCod].prod_id);
            acc.newPrices.push(price);
          }
        } catch (error) {
          Log.error(
            `Create Promotions LevePague: falha ao criar preço \nErro:${error}\nPreço:`,
            price,
          );
        }
        return acc;
      },
      { newPrices: [], existingPrices: [] } as {
        newPrices: Price[];
        existingPrices: Price[];
      },
    );

    await Promise.all([
      insertPrices(queryRunner, newPrices),
      updatePrices(queryRunner, existingPrices),
    ]);
  } catch (error) {
    console.error('[CASA-DO-ARROZ] :: CreatePromotionsLevePague :: Erro ao criar preços:', error);
    throw new Error(`[CASA-DO-ARROZ] :: CreatePromotionsLevePague :: Erro ao criar preços: ${error}`);
  }
};


const processPromotionsBatch = async (
  queryRunner: QueryRunner,
  promotions: Promotion[],
  productInfo: ProductInfoMap,
): Promise<void> => {
  if (promotions.length == 0) return;
  try {
    const data = promotions
      .map((promotion) => {
        return promotion.getState().products.map((product) => {
          const prod = productInfo[product.getState().prodCod];
          const price = prod.prices.filter(
            (p) => p.vlr_idcomercial == 1 && p.vlr_filial == promotion.getState().dpEstabelecimento,
          )[0];
          const dailyprintInfo = getDailyprintInfo(1, prod.prod_sessao);
          return {
            dpProduto: prod.prod_id,
            dpValor: price.vlr_id,
            dpDgcartaz: dailyprintInfo.dpDgcartaz,
            dpDgmotivo: dailyprintInfo.dpDgmotivo,
            dpFortam: dailyprintInfo.dpFortam,
            dpTamanho: dailyprintInfo.dpTamanho,
            dpEstabelecimento: promotion.getState().dpEstabelecimento,
            dpData: promotion.getState().dpData,
            dpNome: promotion.getState().dpNome,
            dpEmpresa: promotion.getState().dpEmpresa,
            dpUsuario: promotion.getState().dpUsuario,
            dpHora: promotion.getState().dpHora,
            dpMobile: 0,
            dpQntparcela: 1,
            dpIdtaxa: 'sjuros',
            dpAuditoria: 0,
          };
        });
      })
      .flat();
  
    const entities = queryRunner.manager.create(CfDailyprintEntity, data);
    await queryRunner.manager.insert(CfDailyprintEntity, entities);
      
    } catch (error) {
    console.error('[CASA-DO-ARROZ] :: CreatePromotionsLevePague :: Erro ao criar promoções:', error);
    throw new Error(`[CASA-DO-ARROZ] :: CreatePromotionsLevePague :: Erro ao criar promoções: ${error}`);
    }
}

const processBranch = async (
  connection: DataSource,
  branchId: number,
): Promise<boolean> => {
  const queryRunner = connection.createQueryRunner();
  const promotions = await fetchPromotions(branchId);

  const codes = [
    ...new Set(
      promotions
        .map((promotion) => promotion.items.map((item) => item.prodCod))
        .flat(),
    ),
  ];

  await queryRunner.startTransaction();
  try {
    let existingProducts = await checkIfProductsExist(queryRunner, codes);
    const missingCodes = codes.filter(
      (code) => existingProducts[code] === undefined,
    );

    await processProductsBatch(queryRunner, missingCodes);

    for (const [key, product] of Object.entries(existingProducts)) {
      if (product.prices.length == 0) missingCodes.push(parseInt(key));
      
    }

    await processMissingPricesBatch(
      queryRunner,
      branchId,
      [...new Set(missingCodes)],
    );

    existingProducts = await checkIfProductsExist(queryRunner, codes);

    const transformedPromotions = promotions.reduce((acc,promotionDTO)=>{
      const promotion = transformPromotion(promotionDTO, existingProducts)
      if (promotion) acc.push(promotion)
      return acc
    }, [] as Promotion[])
    const prices: Price[] = transformedPromotions.map(promotion=>{
      return promotion.getState().products.map(product=>{
        return product.getState().prices
      }).flat()
    }).flat() 
    
    await processPricesBatch(
      queryRunner,
      branchId,
      prices,
      existingProducts,
    );

    existingProducts = await checkIfProductsExist(queryRunner, codes);
    await processPromotionsBatch(queryRunner, transformedPromotions, existingProducts)

    await queryRunner.commitTransaction();
    return true
  } catch (err) {
    await queryRunner.rollbackTransaction();
    //console.log('[CASA-DO-ARROZ] :: CreatePromotions :: Falha ao criar promoções ', err);
    Log.error(`[CASA-DO-ARROZ] :: CreatePromotionsLevePague :: Falha ao criar promoções ${err}`)
    return false
   } finally {
    await queryRunner.release();
    
  }
};

async function createPromotionsLevePague() {
  try {
    // Conectar ao banco de dados
    const mysqlDatabase = new MysqlTypeOrmAdapter();
    Log.setClientName('casa-do-arroz');
    await Promise.all([
      mysqlDatabase.connect(),
      apiGateway
        .login
        (
        'JwRxqCJL2naPMqPTnD8FEhE1geZRIxSt3zCc92TFZvmZjrt5EC3sZE9TXUmVK966HpFOxlMYE1BcKRxhYrjqJNZOVJcNkTWnpdOdg0kXRWJy8BwIWhMQV8nEsHqRsT76mwq_Mm_yf10CREIp6-1j3TJQuOdeGewVqKLmObhDUkSyZMeV2RqZarxEfXRCqongWL4V7tgzTo4ehUm2afQJcmiiYTSDPbgzdmQ30QgyZGOLpo-3DE7pbZF6U6xuCvLUDbpgjWeFZ8u4doNcovvtragecWBbIfU0hQF3WJM9MhNq8kjosHogMnPN7x9w1qsMbp-R8jTzuZk3PEdcrmXSVbRKJrL1vafQ5j8PLqbqkdRJmwfXosVmhPu6hgLkeq_mXgX7j2Xne3fPjDcifkjSSHgRBBuJk3aTGm7oFl23jUc-kesD9KAPKWDfKleitbDoE-XPA_zity3HAHlPhhQhQeQEZRIP-AU1JIntqHQ9p7QXvlV522gG6-isar0vcv_TMqrlwrqvM6PANbpK6qn5p9LOcvbvNU37BtkBjTbQNVI3MWjDXH0OeJYsi4uZ3M8u5Eg6zXWSkeUT7lHtJ6RMypqhkTpN3D-3vCt8-as0Vannshr9uhO8Tcrd4T1C7cAWekdms-jxpdiVZclkuOAlmP_GvpkDXOONwq3_rW7RCzoUZZ5Ja8qJqkjC2e-GeiRIqkueuQ',

        ),
    ]);
    const branches = await fetchBranches();
    const result = await processBranch(mysqlDatabase.getConnection(), branches[0])
    return result
    // const results = await Promise.all(
    //   branches.map((branchId) =>
    //     processBranch(mysqlDatabase.getConnection(), branchId),
    //   ),
    // );
    // const output = ''
    // results.map((value, index) => {
    //   if (!value) output.concat(`\nErro ao processar filial ${branches[index]}`);
    //   else output.concat(`Filial ${branches[index]} processada com sucesso`);
    // });
    // return output
  } catch (err) {
    throw err;
  }

  
}
createPromotionsLevePague()
export { createPromotionsLevePague };
