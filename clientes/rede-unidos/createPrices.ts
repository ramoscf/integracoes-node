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
  vlr_promocao: number | null;
  vlr_produto: number;
}

interface MySQLRecord {
  prod_cod: number;
  vlr_idcomercial: number;
  vlr_filial: number;
  vlr_data_de: string;
  vlr_data_ate: string;
  vlr_valores: string;
  vlr_hora: string;
  vlr_empresa: number;
  vlr_usuario: number;
  vlr_produto?: number;
  vlr_id?: number;
}

type ProductInfo = {
  prod_id: number;
  prices: {
    vlr_id: number;
    vlr_filial: number;
  }[];
};

const mysqlDatabase = new MysqlTypeOrmAdapter();
const sqlserverDatabase = new MssqlTypeOrmAdapter();

const transformRecord = (record: SQLServerRecord): MySQLRecord => {
  const value: string =
    record.vlr_promocao && record.vlr_promocao > 0
      ? record.vlr_promocao.toLocaleString('pt-BR',{
        minimumFractionDigits: 2
    })
      : record.vlr_produto.toLocaleString('pt-BR',{
        minimumFractionDigits: 2
    });
  const dynamic = 1;
  const today = new Date();
  const hour = today
    .toLocaleTimeString('pt-BR', {
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
      hour12: false,
    })
    .split(' ')[0];

  return {
    prod_cod: record.plu,
    vlr_idcomercial: dynamic,
    vlr_filial: record.id_Loja,
    vlr_data_de: today.toISOString().split('T')[0],
    vlr_data_ate: today.toISOString().split('T')[0],
    vlr_valores: value,
    vlr_hora: hour,
    vlr_empresa: 1,
    vlr_usuario: 1,
  };
};

const fetchDataStreamFromSQLServer = async (): Promise<Readable> => {
  const connection = sqlserverDatabase.getConnection();
  const today = new Date().toISOString().split('T')[0];
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1); // Subtrai 1 dia
  const yesterdayString = yesterday.toISOString().split('T')[0];

  return connection
    .createQueryBuilder()
    .select([
      'descricao',
      'plu',
      'codigo_barra',
      'unidade',
      'Vlr_Cluster',
      'vlr_promocao',
      'vlr_produto',
      'id_Loja',
    ])
    .from('VW_UNVDIGITAL_PRODUTO', 'vw')
    .where(`vw.dt_ultima_alteracao >= '${today}'`)
    .orWhere(`dtFim_Promocao >= '${today}'`)
    .orWhere(`ult_Promocao = '${yesterdayString}'`)
    .distinct(true)
    .stream();

  // return sqlServerPool.request().query().stream();
};

const checkIfPluExistsBatch = async (
  queryRunner: QueryRunner,
  plus: number[],
): Promise<{ [key: number]: ProductInfo }> => {
  // const connection = await mySqlPool.getConnection();

  try {
    const rows = await queryRunner.manager.query(
      'SELECT p.prod_cod, p.prod_id, v.vlr_id, v.vlr_filial FROM cf_produto p LEFT JOIN cf_valor v on p.prod_id = v.vlr_produto WHERE prod_cod IN (?)',
      [plus],
    );
    const pluMap: { [key: number]: ProductInfo } = {};
    rows.forEach((row: any) => {
      const prod_cod = parseInt(row.prod_cod);
      const prod_id = parseInt(row.prod_id);
      const vlr_id = parseInt(row.vlr_id);
      const vlr_filial = parseInt(row.vlr_filial);
      if (vlr_id) {
        if (!pluMap[prod_cod])
          pluMap[prod_cod] = { prod_id, prices: [{ vlr_id, vlr_filial }] };
        else pluMap[prod_cod].prices.push({ vlr_id, vlr_filial });
      } else {
        if (!pluMap[prod_cod]) pluMap[prod_cod] = { prod_id, prices: [] };
      }
    });

    return pluMap;
  } catch (error) {
    Log.error(
      'Create Prices: não foi possível buscar os produtos\n' +
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
    const record = records
      .map((record) => {
        Log.info('Create Prices: criando o preço', record);
        return `(${record.vlr_produto}, ${record.vlr_idcomercial}, ${record.vlr_filial}, '${record.vlr_data_de}', '${record.vlr_data_ate}', '${record.vlr_valores}', '${record.vlr_hora}', ${record.vlr_empresa}, ${record.vlr_usuario} )`;
      })
      .join(', ');

    const query = `
    INSERT INTO cf_valor (vlr_produto, vlr_idcomercial, vlr_filial, vlr_data_de, vlr_data_ate, vlr_valores, vlr_hora, vlr_empresa, vlr_usuario)
    VALUES ${record}
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

const updateBatch = async (
  queryRunner: QueryRunner,
  records: MySQLRecord[],
): Promise<void> => {
  if (records.length === 0) return;

  try {
    const ids = records.map((record) => {
      Log.info('Create Prices: atualizando produto', record);
      return record.vlr_id;
    });

    const updateDataDe = records
      .map((record) => `WHEN ${record.vlr_id} THEN '${record.vlr_data_de}'`)
      .join(' ');
    const updateDataAte = records
      .map((record) => `WHEN ${record.vlr_id} THEN '${record.vlr_data_ate}'`)
      .join(' ');
    const updateValores = records
      .map((record) => `WHEN ${record.vlr_id} THEN '${record.vlr_valores}'`)
      .join(' ');
    const updateHora = records
      .map((record) => `WHEN ${record.vlr_id} THEN '${record.vlr_hora}'`)
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

const processBatchChunk = async (batch: SQLServerRecord[]) => {
  const transformedBatch = batch.map(transformRecord);
  const plus = [...new Set(transformedBatch.map((record) => record.prod_cod))];

  const queryRunner = mysqlDatabase.getConnection().createQueryRunner();

  await queryRunner.startTransaction();
  try {
    const existingPlus = await checkIfPluExistsBatch(queryRunner, plus);

    const newRecords = transformedBatch.reduce((acc, record) => {
      try {
        const f1 = existingPlus[record.prod_cod] !== undefined;
        if (!f1) {
          Log.error('Create Prices: produto não encontrado', record);
          return acc;
        }

        const existingPrice = existingPlus[record.prod_cod].prices.filter(
          (price) => {
            return price.vlr_filial == record.vlr_filial;
          },
        );
        if (existingPrice.length == 0) {
          acc.push({
            ...record,
            vlr_produto: existingPlus[record.prod_cod].prod_id,
          });
        }
        return acc;
      } catch (error) {
        Log.error('Create Prices: produto não encontrado', record);
        return acc;
      }
    }, [] as MySQLRecord[]);
    const existingRecords = transformedBatch.reduce((acc, record) => {
      try {
        const f1 = existingPlus[record.prod_cod] !== undefined;
        if (!f1) {
          Log.error('Create Prices: produto não encontrado', record);
          return acc;
        }

        const existingPrice = existingPlus[record.prod_cod].prices.filter(
          (price) => {
            return price.vlr_filial == record.vlr_filial;
          },
        );
        if (existingPrice.length != 0) {
          acc.push({
            ...record,
            vlr_produto: existingPlus[record.prod_cod].prod_id,
            vlr_id: existingPrice[0].vlr_id,
          });
        }
        return acc;
      } catch (error) {
        Log.error('Create Prices: produto não encontrado', record);
        return acc;
      }
    }, [] as MySQLRecord[]);

    await Promise.all([
      insertBatch(queryRunner, newRecords),
      updateBatch(queryRunner, existingRecords),
    ]);

    await queryRunner.commitTransaction();
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
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

async function createPrices() {
  try {
    var startTime = performance.now();
    Log.setClientName('rede-unidos');
    await Promise.all([mysqlDatabase.connect(), sqlserverDatabase.connect()]);
    // await mysqlDatabase.connect();
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
// createPrices();
// var startTime = performance.now()
export { createPrices };
// var endTime = performance.now()
// var time = (endTime - startTime)/1000
// console.log(`Call to main() took ${time} seconds`)
