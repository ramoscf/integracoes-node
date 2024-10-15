import { DataSource, QueryRunner } from 'typeorm';
import ApiGatewayHttp from '../infra/http/apiGatewayHttp';
import Product from '../domain/entities/Product';
import Price from '../domain/entities/Price';
import Promotion from '../domain/entities/Promotion';
import { APIPackaging } from '../domain/dtos/PackageDTO';
import { ProductDivision } from '../domain/dtos/CategoryDTO';
import AxiosAdapter from '../../shared/http/AxiosAdapter';
import Log from '../infra/Logger';
// import MysqlTypeOrmAdapter from '../../shared/database/MysqlTypeOrmAdapter copy';
import MysqlTypeOrmAdapter from '../infra/database/MysqlTypeOrmAdapter';
import { CfDailyprintEntity } from '../infra/database/mapping/CfDailyprint';
import { CfProdutoEntity } from '../infra/database/mapping/CfProduto';
import { CfValorEntity } from '../infra/database/mapping/CfValor';

type ProductInfoMap = {
  [key: number]: {
    prod_id: number;
    prod_sessao: string;
    prices: {
      vlr_id: number;
      vlr_filial: number;
      vlr_idcomercial: number;
    }[];
  };
};

const client = new AxiosAdapter();
const apiGateway = new ApiGatewayHttp(client);

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

// Função para buscar filiais
const fetchPromotions = async (): Promise<Promotion[]> => {
  const response = await apiGateway.getPromotions();
  return response;
};

// Função para buscar detalhes de um produto específico na API
const fetchProducts = async (codes: number[]): Promise<Product[]> => {
  const response = await apiGateway.getProductsByCode(codes);
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

// Função para verificar quais produtos já existem no banco de dados
const checkIfProductsExist = async (
  queryRunner: QueryRunner,
  prodCodes: number[],
): Promise<ProductInfoMap> => {
  if (prodCodes.length == 0) return [];

  const rows = await queryRunner.manager.query(
    'SELECT p.prod_cod, p.prod_sessao, p.prod_id, v.vlr_id, v.vlr_filial, v.vlr_idcomercial FROM cf_produto p LEFT JOIN cf_valor v on p.prod_id = v.vlr_produto WHERE prod_cod IN (?)',
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

    if (vlr_id) {
      if (!productsMap[prod_cod])
        productsMap[prod_cod] = {
          prod_id,
          prod_sessao,
          prices: [{ vlr_id, vlr_filial, vlr_idcomercial }],
        };
      else
        productsMap[prod_cod].prices.push({
          vlr_id,
          vlr_filial,
          vlr_idcomercial,
        });
    } else {
      if (!productsMap[prod_cod])
        productsMap[prod_cod] = { prod_id, prod_sessao, prices: [] };
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
    // const values = records
    //   .map((record) => {
    //     Log.info('Create Prices: criando o preço', record);
    //     const {
    //       vlrIdcomercial,
    //       vlrValores,
    //       vlrFilial,
    //       vlrDataDe,
    //       vlrDataAte,
    //       vlrHora,
    //       vlrEmpresa,
    //       vlrUsuario,
    //       vlrProduto,
    //     } = record.getState();
    //     return `(${vlrProduto}, ${vlrIdcomercial}, ${vlrFilial}, '${vlrDataDe}', '${vlrDataAte}', '${vlrValores}', '${vlrHora}', ${vlrEmpresa}, ${vlrUsuario} )`;
    //   })
    //   .join(', ');

    // const query = `
    //   INSERT INTO cf_valor (vlr_produto, vlr_idcomercial, vlr_filial, vlr_data_de, vlr_data_ate, vlr_valores, vlr_hora, vlr_empresa, vlr_usuario)
    //   VALUES ${values}
    // `;
    // await queryRunner.query(query);

    const entities = queryRunner.manager.create(
      CfValorEntity,
      records.map((price) => price.getState()),
    );
    await queryRunner.manager.insert(CfValorEntity, entities);

    
  } catch (error) {
    Log.error(
      'Create Prices: não foi possível inserir os preços ' +
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
      Log.info(`Create Prices: atualizando preço ${record.getState().vlrDataDe} -- ${record.getState().vlrDataAte} -- `, record);
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
    console.log(query)
    const result = await queryRunner.query(query);
  } catch (error) {
    Log.error(
      'Create Prices: não foi possível atualizar os preços' +
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
    // await queryRunner.startTransaction();

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
    // await queryRunner.commitTransaction();
    console.log('[CASA-DO-ARROZ] :: CreatePromotions :: Produtos Faltantes processados com sucesso!');
  } catch (err) {
    // await queryRunner.rollbackTransaction();
    console.error('[CASA-DO-ARROZ] :: CreatePromotions :: Erro ao criar produtos faltantes:', err);
  }
  // finally {
  //   await queryRunner.release();
  // }
};

const processPricesBranch = async (
  queryRunner: QueryRunner,
  prices: Price[],
  products: ProductInfoMap,
): Promise<void> => {
  if (prices.length <= 0) return;

  try {
    const { newPrices, existingPrices } = prices.reduce(
      (acc, price, index) => {
        try {
          if (products[price.getState().prodCod] === undefined) {
            Log.error(`Create Prices: falha ao buscar produto `, price);
            return acc;
          }
          const existingPrice = products[
            price.getState().prodCod
          ].prices.filter(
            (p) =>
              p.vlr_filial == price.getState().vlrFilial &&
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
            `Create Prices: falha ao criar preço \nErro:${error}\nPreço:`,
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
    throw error;
  }
};

const processPromotionsBranch = async (
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
    Log.error('Create Promotions: Erro ao inserir promoções', promotions)
    throw error
  }
};

const processBranch = async (
  connection: DataSource,
): Promise<boolean> => {
  const queryRunner = connection.createQueryRunner();
  await queryRunner.clearTable('cf_dailyprint');
  const promotions = await fetchPromotions();
  const codes = [
    ...new Set(
      [
        ...promotions.map((record) =>
          record
            .getState()
            .products.map((product) => product.getState().prodCod),
        ),
      ].flat(),
    ),
  ];

  await queryRunner.startTransaction();
  try {
    let existingProducts = await checkIfProductsExist(queryRunner, codes);

    const missingCodes = codes.filter(
      (code) => existingProducts[code] === undefined,
    );

    await processProductsBatch(queryRunner, missingCodes);

    existingProducts = Object.assign(
      existingProducts,
      await checkIfProductsExist(queryRunner, missingCodes),
    );

    const prices = promotions
      .map((promotion) =>
        promotion
          .getState()
          .products.map((product) =>
            product.getState().prices.map((price) => price),
          ),
      )
      .flat(2);

    await processPricesBranch(queryRunner, prices, existingProducts);

    existingProducts = await checkIfProductsExist(queryRunner, codes);

    await processPromotionsBranch(
      queryRunner,
      promotions,
      existingProducts,
    );

    await queryRunner.commitTransaction();
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.log('[CASA-DO-ARROZ] :: CreatePromotions :: Falha ao criar promoções ', err);
    Log.error(`[CASA-DO-ARROZ] :: CreatePromotions: Falha ao criar promoções ${err}`)
  } finally {
    await queryRunner.release();
    return true;
  }
};

async function createPromotions() {
  try {
    var startTime = performance.now();
    // Conectar ao banco de dados
    const mysqlDatabase = new MysqlTypeOrmAdapter();
    Log.setClientName('casa-do-arroz');
    await Promise.all([
      mysqlDatabase.connect(),
      apiGateway.login(
        // 'U7-jRa1naTa0DyYs8jp9U34ES7M-IFNlrFZirwwIUBQ7JxJ_3yndNy968Qkpm9atYPXIdpVRJgQXkgXNlPspHWdS2m4X6A0KMeov8GKzgBx3IPuqwaGIDwk5ArzOhYwiCzuVdB0CMPUVl_n3oCiXcn99bcL7IflZIFGus4eP_xEfaOwhRB2fejd6LoaM8a5sBMqZQwpLuFlMzBNWSyC2YmaPnB8uCJ9TsHm3ycOEkBE80lzFUt9Yz0_DsUSSyt_VvZo7gai9MWPomAXyxNUUHumFWTlAxI9m8gd4J_EPCUy4Pa0hnn7WiYYG1QPn4ncIyCn_TMS5UDckFRbJzrGGmbkRqmXRgRv_gGGpimBy5xNdRfehNsYo_7Z5VjDds_T_n8BjeSNxQCXKuPyMDCFH2859nlcFn-VaDZxJK_mFvg8IA_TUjQdQvwltRf_4kefNILZ7xfrMEeqH8na1Q6ZbX1bNp1d0p1yJw00LPUDCzeWCZzkGnkBFzlNb0RJL3QG7bPOP92Q56cKiCSya3dQGDKkGcwu3xoCfqe58E3kZIioezKrc4wSqGr_zZ5N4LmToTvt1vJs5FnIuNwRqxDOQxyWPFFbUoaGEn1hx-Ea-5le4ZZM6Nrgc0dQKaLyneO3jxkJqxizd5g-IJ6m9cY_2RrN9jj_usCzn0EfbCiFMMilFYwsKATpyLhaT5RFX9xAWNDBAng',
      ),
    ]);

    const result = await processBranch(mysqlDatabase.getConnection());
    var endTime = performance.now();
    var time = ((endTime - startTime) / 1000).toFixed(4);
    console.log(
      `[CASA-DO-ARROZ] :: CreatePromotions :: Script finalizado com sucesso! -- ${time} segundos `,
    );
    return `[CASA-DO-ARROZ] :: CreatePromotions :: Script finalizado com sucesso! -- ${time} segundos `;
 
  } catch (err) {
    throw new Error(`[CASA-DO-ARROZ] :: CreatePromotions :: Erro ao executar script ${err}`);
  }
}
// createPromotions();
export { createPromotions };
