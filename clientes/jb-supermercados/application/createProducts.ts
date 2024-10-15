import { QueryRunner } from 'typeorm';
import { Readable } from 'stream';
import { performance } from 'perf_hooks';
import OracleTypeOrmAdapter from '../infra/OracleTypeOrmAdapter';
import Log from '../../shared/log/Logger';
import Product from '../domain/entities/Product';
import { CfProdutoEntity } from '../../shared/database/mapping/CfProduto';
import { ProductDTO } from '../domain/dtos/ProductDTO';
import MysqlTypeOrmAdapter from '../infra/MysqlTypeOrmAdapter';
// import MysqlTypeOrmAdapter from '../../shared/database/MysqlTypeOrmAdapter copy';

const mysqlDatabase = new MysqlTypeOrmAdapter();
const oracleDatabase = new OracleTypeOrmAdapter();

const transformRecord = (record: ProductDTO): Product => {
  return new Product({
    prodNome: record.NOME,
    prodCod: record.CODIGO,
    prodSku: record.SKU,
    prodProporcao: record.PROPORCAO,
    prodDesc: record.DESCRICAO,
    prodSessao: record.SECAO,
    prodGrupo: record.GRUPO,
    prodSubgrupo: record.SUBGRUPO,
  });
};

const fetchDataStream = async (queryRunner: QueryRunner): Promise<Readable> => {
  const today = new Date().toISOString().split('T')[0];
  return queryRunner.stream(`
      SELECT 
      NOME,
      CODIGO,
      SECAO,
      GRUPO,
      SUBGRUPO,
      EANINTERNO as SKU,
      PROPORCAO,
      DESCRICAO
      FROM CLT158356CARTAZFACIL.CTZFCL_PRODUTOS
      WHERE TRUNC(DTAHORALTERACAO) >= TO_DATE('${today}', 'YYYY-MM-DD')
      `);
};

const checkIfPluExistsBatch = async (
  queryRunner: QueryRunner,
  plus: number[],
): Promise<Set<number>> => {
  try {
    const rows = await queryRunner.query(
      'SELECT prod_cod FROM cf_produto WHERE prod_cod IN (?)',
      [plus],
    );
    return new Set<number>(rows.map((row: any) => parseInt(row.prod_cod)));
  } catch (error) {
    Log.error(
      'Create Products: não foi possível buscar os produtos\n' +
        error +
        '\nCódigos:',
      plus,
      'database-error',
    );
    throw error;
  }
};
const insertBatch = async (
  queryRunner: QueryRunner,
  records: Product[],
): Promise<void> => {
  if (records.length === 0) return;
  try {
    const entities = queryRunner.manager.create(
      CfProdutoEntity,
      records.map((product) => {
        Log.info('Create Products: criando o produto', product.getState());
        return product.getState();
      }),
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

const updateBatch = async (
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
          `WHEN ${record.getState().prodCod} THEN '${record.getState().prodNome}'`,
      )
      .join(' ');
    const updateProdSku = records
      .map(
        (record) =>
          `WHEN ${record.getState().prodCod} THEN ${record.getState().prodSku}`,
      )
      .join(' ');
    const updateProdProporcao = records
      .map(
        (record) =>
          `WHEN ${record.getState().prodCod} THEN '${record.getState().prodProporcao}'`,
      )
      .join(' ');
    const updateProdDesc = records
      .map(
        (record) =>
          `WHEN ${record.getState().prodCod} THEN '${record.getState().prodDesc}'`,
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

const processBatchChunk = async (batch: ProductDTO[]) => {
  const transformedBatch = batch.map(transformRecord);
  const plus = [
    ...new Set(transformedBatch.map((record) => record.getState().prodCod)),
  ];

  const queryRunner = mysqlDatabase.getConnection().createQueryRunner();

  await queryRunner.startTransaction();
  try {
    const existingPlus = await checkIfPluExistsBatch(queryRunner, plus);

    const newRecords = [
      ...new Set(
        transformedBatch.filter(
          (record) => !existingPlus.has(record.getState().prodCod),
        ),
      ),
    ];
    const existingRecords = [
      ...new Set(
        transformedBatch.filter((record) =>
          existingPlus.has(record.getState().prodCod),
        ),
      ),
    ];

    await Promise.all([
      insertBatch(queryRunner, newRecords),
      updateBatch(queryRunner, existingRecords),
    ]);

    await queryRunner.commitTransaction();
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.log("[JB-SUPERMERCADOS] :: ", err);
  } finally {
    await queryRunner.release();
  }
};

const processBatch = async (batchSize: number) => {
  try {
    const connection = oracleDatabase.getConnection();
    const queryRunner = connection.createQueryRunner();

    const dataStream = await fetchDataStream(queryRunner);
    let batch: ProductDTO[] = [];

    dataStream
      .on('data', async (record: ProductDTO) => {
        batch.push(record);
        if (batch.length >= batchSize) {
          dataStream.pause();
          console.log('[JB-SUPERMERCADOS] :: Working on batch ...')
          await processBatchChunk(batch);
          batch = [];
          dataStream.resume();
        }
      })
      .on('end', async () => {
        if (batch.length > 0) {
          console.log('[JB-SUPERMERCADOS] :: Working on final batch ...')
          await processBatchChunk(batch);
        }
        console.log('[JB-SUPERMERCADOS] :: Finished')
        await queryRunner.release();
      })
      .on('error', async (err) => {
        console.error('[JB-SUPERMERCADOS] :: Erro ao processar os dados:', err);
        await queryRunner.release();
      });
  } catch (error) {
    throw error;
  }
};

async function createProducts() {
  try {
    //tunnel para testes
    // await createSSHTunnel();
    //
    console.log(`[JB-SUPERMERCADOS] :: Iniciando criação de Produtos`);

    var startTime = performance.now();
    Log.setClientName('jb-supermercados');
    await Promise.all([mysqlDatabase.connect(), oracleDatabase.connect()]);
    const batchSize = 1000; // Tamanho do lote, ajuste conforme necessário
    await processBatch(batchSize);

    var endTime = performance.now();
    var time = ((endTime - startTime) / 1000).toFixed(4);
    console.log(`[JB-SUPERMERCADOS] :: Script finalizado com sucesso! -- ${time} segundos `);
    return `[JB-SUPERMERCADOS] :: Script finalizado com sucesso! -- ${time} segundos `
} catch (error) {
    throw error;
  }
}

// createProducts();
export { createProducts };
