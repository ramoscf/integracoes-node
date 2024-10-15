import { QueryRunner } from 'typeorm';
import MysqlTypeOrmAdapter from '../shared/database/MysqlTypeOrmAdapter';
import { Readable } from 'stream';
import { performance } from 'perf_hooks';
import Log from '../shared/log/Logger';
import MssqlTypeOrmAdapter from './MssqlTypeOrmAdapter';

interface SQLServerRecord {
  id_Loja: number;
  plu: number;
  descricao: string;
  Marca: string | null;
  unidade: string;
  codigo_barra: number;
  dt_cadastro: Date;
  dt_ultima_alteracao: Date;
  ativo: string;
  Vlr_Cluster: number | null;
  vlr_promocao: number;
  vlr_produto: number;
}

interface MySQLRecord {
  prod_nome: string;
  prod_cod: number;
  prod_sku: number;
  prod_proporcao: string;
  prod_desc: string;
  prod_empresa: number;
  prod_estabelecimento: number;
  prod_flag_100g: string;
}

const mysqlDatabase = new MysqlTypeOrmAdapter();
const sqlserverDatabase = new MssqlTypeOrmAdapter();

const transformRecord = (record: SQLServerRecord): MySQLRecord => {
  return {
    prod_nome: record.descricao,
    prod_cod: record.plu,
    prod_sku: record.codigo_barra,
    prod_proporcao: record.unidade,
    prod_desc: record.descricao,
    prod_empresa: 1,
    prod_estabelecimento: 1,
    prod_flag_100g: '',
  };
};

const fetchDataStreamFromSQLServer = async (): Promise<Readable> => {
  const connection = sqlserverDatabase.getConnection();
  const today = new Date().toISOString().split('T')[0]
  return connection
    .createQueryBuilder()
    .select(['descricao', 'plu', 'codigo_barra', 'unidade'])
    .from('VW_UNVDIGITAL_PRODUTO', 'vw')
    .where(`vw.dt_ultima_alteracao >= '${today}'`)
    .orWhere(`dtFim_Promocao >= '${today}'`)
    .distinct(true)
    .stream();

};

const checkIfPluExistsBatch = async (
  queryRunner: QueryRunner,
  plus: number[],
): Promise<Set<number>> => {
  try {
    const rows = await queryRunner.manager.query(
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
  records: MySQLRecord[],
): Promise<void> => {
  if (records.length === 0) return;
  try {
    const values = records
      .map((record) => {
        Log.info('Create Products: criando o produto', record);
        return `('${record.prod_nome}', ${record.prod_cod}, ${record.prod_sku}, '${record.prod_proporcao}', '${record.prod_desc}', ${record.prod_empresa}, ${record.prod_estabelecimento}, '${record.prod_flag_100g}' )`;
      })
      .join(', ');

    const query = `
    INSERT INTO cf_produto (prod_nome, prod_cod, prod_sku, prod_proporcao, prod_desc, prod_empresa, prod_estabelecimento, prod_flag100g )
    VALUES ${values}
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

const updateBatch = async (
  queryRunner: QueryRunner,
  records: MySQLRecord[],
): Promise<void> => {
  if (records.length === 0) return;

  try {
    const ids = records.map((record) => {
      Log.info('Create Products: atualizando produto', record);
      return record.prod_cod;
    });

    const updateProdNome = records
      .map((record) => `WHEN ${record.prod_cod} THEN '${record.prod_nome}'`)
      .join(' ');
    const updateProdSku = records
      .map((record) => `WHEN ${record.prod_cod} THEN ${record.prod_sku}`)
      .join(' ');
    const updateProdProporcao = records
      .map(
        (record) => `WHEN ${record.prod_cod} THEN '${record.prod_proporcao}'`,
      )
      .join(' ');
    const updateProdDesc = records
      .map((record) => `WHEN ${record.prod_cod} THEN '${record.prod_desc}'`)
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

const processBatchChunk = async (batch: SQLServerRecord[]) => {
  const transformedBatch = batch.map(transformRecord);
  const plus = [...new Set(transformedBatch.map((record) => record.prod_cod))];

  const queryRunner = mysqlDatabase.getConnection().createQueryRunner();

  await queryRunner.startTransaction();
  try {
    const existingPlus = await checkIfPluExistsBatch(queryRunner, plus);

    const newRecords = [
      ...new Set(
        transformedBatch.filter((record) => !existingPlus.has(record.prod_cod)),
      ),
    ];
    const existingRecords = [
      ...new Set(
        transformedBatch.filter((record) => existingPlus.has(record.prod_cod)),
      ),
    ];

    await Promise.all([
      insertBatch(queryRunner, newRecords),
      updateBatch(queryRunner, existingRecords),
    ]);

    await queryRunner.commitTransaction();
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err
  } finally {
    await queryRunner.release();
  }
};

const processBatch = async (batchSize: number) => {
  const dataStream = await fetchDataStreamFromSQLServer();
  let batch: SQLServerRecord[] = [];

  dataStream
    .on('data', async (record: SQLServerRecord) => {
      batch.push(record);
      if (batch.length >= batchSize) {
        dataStream.pause();
        await processBatchChunk(batch);
        batch = [];
        dataStream.resume();
      }
    })
    .on('end', async () => {
      if (batch.length > 0) {
        await processBatchChunk(batch);
      }
    })
    .on('error', (err) => {
      console.error('[REDE-UNIDOS] :: Erro ao processar os dados:', err);
    });
};

async function createProducts() {
  try {
  var startTime = performance.now();
  Log.setClientName('rede-unidos');
  await Promise.all([mysqlDatabase.connect(), sqlserverDatabase.connect()]);
  const batchSize = 1000; // Tamanho do lote, ajuste conforme necessário
  await processBatch(batchSize);

  var endTime = performance.now();
  var time = ((endTime - startTime) / 1000).toFixed(4);
  console.log(`[REDE-UNIDOS] :: Script finalizado com sucesso! -- ${time} segundos `)
  return `[REDE-UNIDOS] :: Script finalizado com sucesso! -- ${time} segundos `

  } catch (error) {
    throw new Error(`[REDE-UNIDOS] :: Erro ao executar script ${error}`);
  }
}

export { createProducts };
