import { DataSource, QueryRunner } from 'typeorm';
import ApiGatewayHttp from '../infra/http/apiGatewayHttp';
import Product from '../domain/entities/Product';
import Price from '../domain/entities/Price';
import { ProductDivision } from '../domain/dtos/CategoryDTO';
import { APIPackaging } from '../domain/dtos/PackageDTO';
import AxiosAdapter from '../../shared/http/AxiosAdapter';
import { CfProdutoEntity } from '../../shared/database/mapping/CfProduto';
// import MysqlTypeOrmAdapter from '../../shared/database/MysqlTypeOrmAdapter copy';
import MysqlTypeOrmAdapter from '../infra/database/MysqlTypeOrmAdapter';
import Log from '../infra/Logger';

type ProductInfo = {
  prod_id: number;
  prices: {
    vlr_id: number;
    vlr_filial: number;
    vlr_idcomercial: number;
  }[];
};

const client = new AxiosAdapter();
const apiGateway = new ApiGatewayHttp(client);

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
// Função para verificar quais produtos já existem no banco de dados
const checkIfProductsExist = async (
  queryRunner: QueryRunner,
  prodCodes: number[],
): Promise<{ [key: number]: ProductInfo }> => {
  if (prodCodes.length == 0) return {};

  const rows = await queryRunner.manager.query(
    'SELECT p.prod_cod, p.prod_id, v.vlr_id, v.vlr_filial, v.vlr_idcomercial FROM cf_produto p LEFT JOIN cf_valor v on p.prod_id = v.vlr_produto WHERE prod_cod IN (?)',
    [prodCodes],
  );
  const productsMap: { [key: number]: ProductInfo } = {};
  rows.forEach((row: any) => {
    const prod_cod = parseInt(row.prod_cod);
    const prod_id = parseInt(row.prod_id);
    const vlr_id = parseInt(row.vlr_id);
    const vlr_filial = parseInt(row.vlr_filial);
    const vlr_idcomercial = parseInt(row.vlr_idcomercial);

    if (vlr_id) {
      if (!productsMap[prod_cod])
        productsMap[prod_cod] = {
          prod_id,
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
        productsMap[prod_cod] = { prod_id, prices: [] };
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
    const values = records
      .map((record) => {
        Log.info('Create Prices: criando o preço', record);
        const {
          vlrIdcomercial,
          vlrValores,
          vlrFilial,
          vlrDataDe,
          vlrDataAte,
          vlrHora,
          vlrEmpresa,
          vlrUsuario,
          vlrProduto,
        } = record.getState();
        return `(${vlrProduto}, ${vlrIdcomercial}, ${vlrFilial}, '${vlrDataDe}', '${vlrDataAte}', '${vlrValores}', '${vlrHora}', ${vlrEmpresa}, ${vlrUsuario} )`;
      })
      .join(', ');

    const query = `
    INSERT INTO cf_valor (vlr_produto, vlr_idcomercial, vlr_filial, vlr_data_de, vlr_data_ate, vlr_valores, vlr_hora, vlr_empresa, vlr_usuario)
    VALUES ${values}
  `;

    await queryRunner.query(query);
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
      Log.info('Create Prices: atualizando produto', record);
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
    await queryRunner.startTransaction();

    const products = await fetchProducts(codes);
    const gtinsAndCategories: {
      code: number;
      gtinData: APIPackaging[];
      categoryData: ProductDivision[];
    }[] = [];

    for (const code of codes) {
      // Chama fetchProductGtins e aguarda a resposta
      const gtinData = await fetchProductGtins(code);

      // Chama fetchProductCategory e aguarda a resposta
      const categoryData = await fetchProductCategory(code);

      // Armazena o resultado no array
      gtinsAndCategories.push({ code, gtinData, categoryData });
    }

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
    const transformedProducts = products.map((product) => {
      Log.info('Create Prices: criando produto ', product);
      return transformProduct(
        product,
        gtinsMap[product.getState().prodCod].gtinData,
        gtinsMap[product.getState().prodCod].categoryData,
      );
    });
    await insertProducts(queryRunner, transformedProducts);
    await queryRunner.commitTransaction();
    console.log('Produtos Faltantes processados com sucesso!');
    
  } catch (err: any) {
    await queryRunner.rollbackTransaction();
    console.error('Erro ao criar produtos faltantes:', err);
    Log.error('Erro ao criar produtos faltantes:', err)
  }
};

const processBranch = async (
  connection: DataSource,
  // branchId: number,
): Promise<boolean> => {
  const queryRunner = connection.createQueryRunner();
  const pageSize = 2000;

  for await (const prices of apiGateway.fetchPrices(pageSize)) {
    const codes = [
      ...new Set(prices.map((record) => record.getState().prodCod)),
    ];

    let existingProducts = await checkIfProductsExist(queryRunner, codes); // deve retornar produtos com preços
    const missingCodes = codes.filter(
      (code) => existingProducts[code] === undefined,
    );
    await processProductsBatch(queryRunner, missingCodes);
    await queryRunner.startTransaction();
    try {

      const { newPrices, existingPrices } = prices.reduce(
        (acc, price, index) => {
          try {
            if (existingProducts[price.getState().prodCod] === undefined) {
              Log.error(`Create Prices: falha ao buscar produto `, price);
              return acc;
            }
            const existingPrice = existingProducts[
              price.getState().prodCod
            ].prices.filter(
              (p) =>
                p.vlr_filial == price.getState().vlrFilial &&
                p.vlr_idcomercial == price.getState().vlrIdcomercial,
            );
            if (existingPrice.length !== 0) {
              price.setId(existingPrice[0].vlr_id);
              price.setProductId(
                existingProducts[price.getState().prodCod].prod_id,
              );
              acc.existingPrices.push(price);
            } else {
              price.setProductId(
                existingProducts[price.getState().prodCod].prod_id,
              );
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
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      console.log(err);
      Log.error('Create Prices: Erro ao realizar carga geral');
      continue;
    } 
  }
  await queryRunner.release();
  return true;
};

async function cargaGeralPrecos() {
  try {
    var startTime = performance.now();
    // Conectar ao banco de dados
    const mysqlDatabase = new MysqlTypeOrmAdapter();
    Log.setClientName('casa-do-arroz');
    await Promise.all([
      mysqlDatabase.connect(),
      apiGateway
        .login(),
        // 'Mlz6Z1NNapbEBT3y-uK3Nn-CX85-3_51pKZyDhXlgM2TZIPcrjzMaPJO0k7D02fG6XkmGx1JPUpNxna-2ACj275v29OnTmk14zlTL6jsRrZkl7xI--Lg2uMGEnI5axVLzwdybxxOo6vP261vmF9dJ_orkpqrW9P3-WneLUHhZ3kK1DrlVjyf6jxU2-AuZYUZr5L95_8lEOIa81VWSsxDvCm1pj10SHdMEKF6D7xRgBwFuA58nfMG2J-du6Fs9lFvgPCeUV4iaxgBdmNlzQsuACDWZ3BVZfMSuaWQc_OtEyrMdaWOcPH9pUxDTOfC7di-N3Xcr45h1oN_x7RvEs0KQ1f3jEWV7VO7WV76pHGgoxqBQmGjMkoGF-97WY6m0dQFqYLxlHaPmL6i3AIZ2QdPw0qINjDcicG9YmdZxi6vixESPeXwx1qpqFnDzE0YTJAUJbSQMQXSZrvoZpVSHcduerNjUttSli0W9ZyxB8hYveyxNzwjzUSYhTAHJo5NAcqd6snCTO8N4aZF_oVQQ1ZemE1qlVvqmizG8evJdtn4ywGi8HrQTNE4ndJobVFbNn4-NueCZb3YOca-pzipVqWNSit2ri1fEbOurAsfg1_XjC1s_DVT9MOXopDIJinWsiav3eeQAcPJvWNwWWSbdwQHlzEamuxtCPH0pIuJ3k0KHt8ztQquI5mwd3Jqrqg7hYQuG5WXNg',
    ]);
    const result = await processBranch(mysqlDatabase.getConnection());
    var endTime = performance.now();
    var time = ((endTime - startTime) / 1000).toFixed(4);
    return `Script Carga Geral de Preços finalizado com sucesso! -- ${time} segundos`;
    
  } catch (err) {
    throw err;
  }
}
// createPrices();
export { cargaGeralPrecos };
