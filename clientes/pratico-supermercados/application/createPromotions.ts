import { QueryRunner } from 'typeorm';
import { performance } from 'perf_hooks';
import AxiosAdapter from '../../shared/http/AxiosAdapter';
import { CfProdutoEntity } from '../../shared/database/mapping/CfProduto';
import ApiGatewayHttp from '../infra/http/apiGatewayHttp';
import Product from '../domain/entities/Product';
import Log from '../infra/Logger';
// import MysqlTypeOrmAdapter from '../../shared/database/MysqlTypeOrmAdapter copy';;
import mysql from 'mysql2/promise';
import { RowDataPacket } from 'mysql2'; // ou 'mysql' dependendo da biblioteca que você está usando

async function conn() {
  const connection = await mysql.createConnection({
    host: 'cartazfacilpro.ctj8bnjcqdvd.us-east-2.rds.amazonaws.com',
    user: 'cartazdb',
    password: 'tbCJShR2',
    database: 'supermercadopratico',
  });

  return connection;
}

async function deleteDP() {
  const connection = await conn()

  await connection.execute(
    'DELETE from cf_dailyprint;'
  );
}

async function connectAndSelect(dailyprint) {

  const connection = await conn()



  try {
    if (dailyprint) {
      for (const numero of dailyprint) {

        if (numero.oferta == 'S') {

          //console.log('SELECT cf_produto.prod_id, cv.vlr_id FROM cf_produto JOIN cf_valor cv ON cv.vlr_produto = cf_produto.prod_id WHERE cf_produto.prod_cod = ' + numero.prodCod + ' and vlr_filial = ' + parseInt(numero.dp_estabelecimento, 10));
          const [rows, fields] = await connection.execute(
            'SELECT cf_produto.prod_id, cv.vlr_id FROM cf_produto JOIN cf_valor cv ON cv.vlr_produto = cf_produto.prod_id WHERE cf_produto.prod_cod = ' + numero.prodCod + ' and vlr_filial = ' + parseInt(numero.dp_estabelecimento, 10) + ' LIMIT 1'
          );

          const [r] = await connection.execute<RowDataPacket[]>(
            'SELECT * FROM cf_dailyprint cd WHERE dp_produto = ? AND dp_estabelecimento = ? LIMIT 1',
            [rows[0].prod_id, parseInt(numero.dp_estabelecimento, 10)]
          );
          
          if (r.length === 0) {
            await connection.execute(
              `INSERT INTO cf_dailyprint (
                dp_valor,
                dp_produto, 
                dp_estabelecimento, 
                dp_empresa, 
                dp_usuario, 
                dp_data, 
                dp_nome, 
                dp_mobile, 
                dp_qntparcela, 
                dp_idtaxa, 
                dp_auditoria, 
                dp_dgcartaz, 
                dp_dgmotivo, 
                dp_tamanho, 
                dp_fortam
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                rows[0].vlr_id,
                rows[0].prod_id,
                numero.dp_estabelecimento,
                1, // dp_empresa
                1, // dp_usuario
                numero.dp_data, // dp_nome
                numero.dp_nome,
                0, // dp_mobile
                1, // dp_qntparcela
                'sjuros', // dp_idtaxa
                0, // dp_auditoria
                numero.dp_dgcartaz,
                numero.dp_dgmotivo,
                numero.dp_tamanho,
                numero.dp_fortam,
              ]
            );

          }
        }
      }


    }
  } catch (err) {
    console.error('Erro ao executar a consulta:', err);
  } finally {
    // Encerra a conexão
    await connection.end();
  }
}





const client = new AxiosAdapter();
const apiGateway = new ApiGatewayHttp(client);
// const sqlserverDatabase = new MssqlTypeOrmAdapter();

const fetchBranches = async (): Promise<number[]> => {
  const response = await apiGateway.getBranches();
  return response;
};




const processBatch = async (branchId: number): Promise<any> => {
  //const queryRunner = mysqlDatabase.getConnection().createQueryRunner();
  //await queryRunner.clearTable('cf_dailyprint');
  for await (const products of apiGateway.getAlteredProductsApenasOferta(branchId)) {

    await connectAndSelect(products)

  }

};





async function createPromotions() {
  try {


    var startTime = performance.now();
    Log.setClientName('pratico-supermercados');
    deleteDP()

    await Promise.all([
      apiGateway.login(
        // 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMDAwNTkiLCJpc3MiOiJDYXJ0YXogRmFjaWwiLCJqdGkiOiJhMGM0ZGVkMy1kYTg5LTQxMjEtOGRhZi1hZWNiZGNkMTViZTkiLCJpYXQiOjE3MjQwODgzNjYsImV4cCI6MTcyNDA5MTk2Nn0.6XpyTWYaIKm2uYE_qyBCouRqv_e1_2XaJlk0NCVnpj8',
      ),
    ]);
    const branches = await fetchBranches();
    // await processBatch(branches[0]);
    await Promise.all(
      branches.map(async (branchId) => await processBatch(branchId)),
    );

    var endTime = performance.now();
    var time = ((endTime - startTime) / 1000).toFixed(4);
    return `Script finalizado com sucesso! -- ${time} segundos`;
  } catch (error) {
    throw error;
  }
}
// createProductsAndPrices();
export { createPromotions };
