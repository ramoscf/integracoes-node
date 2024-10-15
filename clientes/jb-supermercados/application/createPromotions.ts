import { DataSource, QueryRunner } from 'typeorm';
import Price from '../domain/entities/Price';
import { Readable } from 'stream';
import OracleTypeOrmAdapter from '../infra/OracleTypeOrmAdapter';
import { PromotionDTO } from '../domain/dtos/PromotionDTO';
import MysqlTypeOrmAdapter from '../infra/MysqlTypeOrmAdapter';
import Log from '../../shared/log/Logger';
import moment from 'moment';

const mysqlDatabase = new MysqlTypeOrmAdapter();
const oracleDatabase = new OracleTypeOrmAdapter();

type ProductInfo = {
  prod_id: number;
  prices: {
    vlr_id: number;
    vlr_filial: number;
    vlr_idcomercial: number;
  }[];
};

const transformRecord = (record: PromotionDTO): Price => {
  return Price.createPromotionalPrice({
    prodCod: record.CODIGO,
    regularPrice: record.PRECOREGULAR,
    vlrFilial: record.NROEMPRESA,
    promotionalPrice: record.PRECOPROMOCIONAL,
    dtaFim: moment(record.DTAFIM, 'DD/MM/YYYY').toDate(),
    dtaInicio: moment(record.DTAINICIO, 'DD/MM/YYYY').toDate(),
  });
};

const fetchDataStreamFromDatabase = async (
  queryRunner: QueryRunner,
): Promise<Readable> => {
  const today = moment().format('DD/MM/YYYY');
  return queryRunner.stream(`
    SELECT * FROM (
    SELECT
    SEQPROMOCAO,
    SEQPRODUTO as CODIGO,
    SEQFAMILIA,
    ROW_NUMBER() OVER (PARTITION BY cp.SEQFAMILIA, cp.NROEMPRESA, cp.SEQPROMOCAO ORDER BY cp.SEQPRODUTO, cp.NROSEGMENTO DESC) AS rn,
    QTDEMBALAGEM,
    PROMOCAO,
    PRECOREGULAR,
    PRECOPROMOCIONAL,
    NROSEGMENTO,
    NROEMPRESA,
    FAMILIA,
    DTAINICIO,
    DTAFIM
    FROM CLT158356CARTAZFACIL.CTZFCL_PROMOCAO cp
    WHERE 1=1
    AND DTAINICIO <= '${today}' 
    AND DTAFIM >= '${today}')
    WHERE rn =1
    `);
};

// Função para verificar quais produtos já existem no banco de dados
const checkIfProductsExists = async (
  queryRunner: QueryRunner,
  prodCodes: number[],
): Promise<{ [key: number]: ProductInfo }> => {
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

const insertPrices = async (
  queryRunner: QueryRunner,
  records: Price[],
): Promise<void> => {
  if (records.length === 0) return;
  try {
    const values = records
      .map((record) => {
        Log.info('Create Promotions: criando o preço', record);
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
      'Create Promotions: não foi possível inserir os preços ' +
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
      Log.info('Create Promotions: atualizando preço', record);
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

const processBatchChunk = async (batch: PromotionDTO[]) => {
  const transformedBatch = batch.map(transformRecord);
  const codes = [
    ...new Set(transformedBatch.map((record) => record.getState().prodCod)),
  ];

  const queryRunner = mysqlDatabase.getConnection().createQueryRunner();

  await queryRunner.startTransaction();
  try {
    const existingProducts = await checkIfProductsExists(queryRunner, codes);

    const { newPrices, existingPrices } = transformedBatch.reduce(
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
    console.log('[JB-SUPERMERCADOS] ::', err);
  } finally {
    await queryRunner.release();
  }
};

const processBatch = async (batchSize: number): Promise<void> => {
  try {
    const connection = oracleDatabase.getConnection();
    const queryRunner = connection.createQueryRunner();

    const dataStream = await fetchDataStreamFromDatabase(queryRunner);
    let batch: PromotionDTO[] = [];

    dataStream
      .on('data', async (record: PromotionDTO) => {
        batch.push(record);
        if (batch.length >= batchSize) {
          dataStream.pause();
          console.log('[JB-SUPERMERCADOS] :: Working on batch ...');

          await processBatchChunk(batch);
          batch = [];
          dataStream.resume();
        }
      })
      .on('end', async () => {
        if (batch.length > 0) {
          console.log('[JB-SUPERMERCADOS] :: Working on final batch ...');
          await processBatchChunk(batch);
        }
        console.log('[JB-SUPERMERCADOS] :: Finished');
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

async function createPromotions() {
  try {
    //tunnel para testes
    //  await createSSHTunnel();
    //
    console.log(`[JB-SUPERMERCADOS] :: Iniciando criação de Promoções`);

    var startTime = performance.now();
    // Conectar ao banco de dados

    Log.setClientName('jb-supermercados');
    await Promise.all([mysqlDatabase.connect(), oracleDatabase.connect()]);
    const batchSize = 1000;
    await processBatch(batchSize);
    var endTime = performance.now();
    var time = ((endTime - startTime) / 1000).toFixed(4);
    console.log(
      `[JB-SUPERMERCADOS] :: Script finalizado com sucesso! -- ${time} segundos `,
    );
    return `[JB-SUPERMERCADOS] :: Script finalizado com sucesso! -- ${time} segundos `;
  } catch (err) {
    throw err;
  }
}
// createPromotions();
export { createPromotions };
