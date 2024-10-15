import { QueryRunner } from 'typeorm';
import { performance } from 'perf_hooks';
import AxiosAdapter from '../../shared/http/AxiosAdapter';
import ApiGatewayHttp from '../infra/http/apiGatewayHttp';
import Product from '../domain/entities/Product';
import Log from '../infra/Logger';
import MysqlTypeOrmAdapter from '../infra/database/MysqlTypeOrmAdapter';
// import MysqlTypeOrmAdapter from '../../shared/database/MysqlTypeOrmAdapter copy';
import Price from '../domain/entities/Price';
import { CfProdutoEntity } from '../infra/database/mapping/CfProduto';
import { CfValorEntity } from '../infra/database/mapping/CfValor';

type ProductInfo = {
  prod_id: number;
  prices: {
    vlr_id: number;
    vlr_filial: number;
    vlr_idcomercial: number;
  }[];
};

const mysqlDatabase = new MysqlTypeOrmAdapter();
const client = new AxiosAdapter();
const apiGateway = new ApiGatewayHttp(client);
// const sqlserverDatabase = new MssqlTypeOrmAdapter();

const fetchBranches = async (): Promise<number[]> => {
  const response = await apiGateway.getBranches();
  return response;
};

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

const insertProducts = async (
  queryRunner: QueryRunner,
  records: Product[],
): Promise<void> => {
  if (records.length === 0) return;
  try {
    const entities = queryRunner.manager.create(
      CfProdutoEntity,
      records.map((product) => product.getState()),
    );
    await queryRunner.manager.insert(CfProdutoEntity, entities);
  } catch (error) {
    Log.error(
      'Create Products: não foi possível atualizar os produtos' + error,
      records,
      'database-error',
    );
    throw error;
  }
};

const updateProducts = async (
  queryRunner: QueryRunner,
  records: Product[],
): Promise<void> => {
  if (records.length === 0) return;

  try {
    const ids = records.map((record) => {
      Log.info('Create Products: atualizando produto', record);
      return record.getState().prodCod;
    });

    const updateProdNome = records
      .map(
        (record) =>
          `WHEN ${record.getState().prodCod} THEN "${record.getState().prodNome.replace(/"/g, '\\"')}"`,
      )
      .join(' ');
    const updateProdSku = records
      .map(
        (record) =>
          `WHEN ${record.getState().prodCod} THEN "${record.getState().prodSku}"`,
      )
      .join(' ');
    const updateProdProporcao = records
      .map(
        (record) =>
          `WHEN ${record.getState().prodCod} THEN "${record.getState().prodProporcao.replace(/"/g, '\\"')}"`,
      )
      .join(' ');
    const updateProdDesc = records
      .map(
        (record) =>
          `WHEN ${record.getState().prodCod} THEN "${record.getState().prodDesc.replace(/"/g, '\\"')}"`,
      )
      .join(' ');

    const query = `
    UPDATE cf_produto
    SET
      prod_nome = CASE prod_cod ${updateProdNome} END,
      prod_sku = CASE prod_cod ${updateProdSku} END,
      prod_proporcao = CASE prod_cod ${updateProdProporcao} END,
      prod_desc = CASE prod_cod ${updateProdDesc} END
    WHERE prod_cod IN (${ids.join(', ')})
  `;

    await queryRunner.query(query);
  } catch (error) {
    Log.error(
      'Create Products: não foi possível atualizar os produtos' + error,
      records,
      'database-error',
    );
    throw error;
  }
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
      'Create Prices: não foi possível inserir os preços ' + error,
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
      Log.info('Create Prices: atualizando preço', record);
      return record.getState().vlrId;
    });

    const updateDataDe = records
      .map(
        (record) =>
          `WHEN ${record.getState().vlrId} THEN "${record.getState().vlrDataDe}"`,
      )
      .join(' ');
    const updateDataAte = records
      .map(
        (record) =>
          `WHEN ${record.getState().vlrId} THEN "${record.getState().vlrDataAte}"`,
      )
      .join(' ');
    const updateValores = records
      .map(
        (record) =>
          `WHEN ${record.getState().vlrId} THEN "${record.getState().vlrValores}"`,
      )
      .join(' ');
    const updateHora = records
      .map(
        (record) =>
          `WHEN ${record.getState().vlrId} THEN "${record.getState().vlrHora}"`,
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

const processProductBatch = async (
  products: Product[],
  queryRunner: QueryRunner,
) => {
  // for await (const products of apiGateway.getAllProducts(branchId)) {
  await queryRunner.startTransaction();
  try {
    const codes = [
      ...new Set(products.map((record) => record.getState().prodCod)),
    ];
    const existingProducts = await checkIfProductsExist(queryRunner, codes);

    const { newRecords, existingRecords } = products.reduce(
      (acc, product) => {
        try {
          existingProducts[product.getState().prodCod] !== undefined
            ? acc.existingRecords.push(product)
            : acc.newRecords.push(product);
        } catch (error) {
          Log.error(
            `Create Products: falha ao criar produto \nErro:${error}\nProduto:`,
            product,
          );
        }
        return acc;
      },
      { newRecords: [], existingRecords: [] } as {
        newRecords: Product[];
        existingRecords: Product[];
      },
    );

    await Promise.all([
      insertProducts(queryRunner, newRecords),
      updateProducts(queryRunner, existingRecords),
    ]);

    await queryRunner.commitTransaction();
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.log(err);
    Log.error(`Create Products: Erro ${err}`);
  }
};

const processPricesBatch = async (
  products: Product[],
  queryRunner: QueryRunner,
): Promise<void> => {
  await queryRunner.startTransaction();
  try {
    const codes = [
      ...new Set(products.map((record) => record.getState().prodCod)),
    ];

    const existingProducts = await checkIfProductsExist(queryRunner, codes);
    const prices = products.map((product) => product.getState().prices).flat();

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
    Log.error(`Create Prices: Erro ${err}`);
  }
};

const processBatch = async (branchId: number): Promise<any> => {
  const queryRunner = mysqlDatabase.getConnection().createQueryRunner();

  for await (const products of apiGateway.getAllProducts(branchId)) {
    await processProductBatch(products, queryRunner);
    await processPricesBatch(products, queryRunner);
  }

  await queryRunner.release();
};

async function cargaGeral() {
  try {
    var startTime = performance.now();
    Log.setClientName('reis-supermercados');
    await Promise.all([
      mysqlDatabase.connect(),
      apiGateway.login(
        // 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMDAwNTkiLCJpc3MiOiJDYXJ0YXogRmFjaWwiLCJqdGkiOiJhMGM0ZGVkMy1kYTg5LTQxMjEtOGRhZi1hZWNiZGNkMTViZTkiLCJpYXQiOjE3MjQwODgzNjYsImV4cCI6MTcyNDA5MTk2Nn0.6XpyTWYaIKm2uYE_qyBCouRqv_e1_2XaJlk0NCVnpj8',
      ),
    ]);
    const branches = await fetchBranches();
    // await processBatch(branches[0]);
    await Promise.all(
      branches.map(async (branchId) => await processBatch(branchId)),
    );

    await mysqlDatabase.close();
    var endTime = performance.now();
    var time = ((endTime - startTime) / 1000).toFixed(4);
    return `Script finalizado com sucesso! -- ${time} segundos`;
  } catch (error) {
    throw error;
  }
}
// cargaGeral();
export { cargaGeral };
