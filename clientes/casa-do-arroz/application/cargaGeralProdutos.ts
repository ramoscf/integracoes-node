import { QueryRunner } from 'typeorm';
import { performance } from 'perf_hooks';
import ApiGatewayHttp from '../infra/http/apiGatewayHttp';
import Product from '../domain/entities/Product';
import { APIPackaging } from '../domain/dtos/PackageDTO';
import { ProductDivision } from '../domain/dtos/CategoryDTO';
import AxiosAdapter from '../../shared/http/AxiosAdapter';
import { CfProdutoEntity } from '../infra/database/mapping/CfProduto'; 
import MysqlTypeOrmAdapter from '../infra/database/MysqlTypeOrmAdapter';
import Log from '../infra/Logger';

const mysqlDatabase = new MysqlTypeOrmAdapter();
const client = new AxiosAdapter();
const apiGateway = new ApiGatewayHttp(client);

const transformRecord = (
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
  gtins.size != 0 ? record.setGtins([...gtins].join(',')) : record.setGtins('');
  record.setProportion(gtinData[0]?.Embalagem || '');
  // gtinData[0] ? record.setProportion(gtinData[0].Embalagem) : record.setProportion('');

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

const fetchProductCategory = async (
  code: number,
): Promise<ProductDivision[]> => {
  const response = await apiGateway.getDivisionByCode(code);
  return response;
};

const fetchProductGtins = async (code: number): Promise<APIPackaging[]> => {
  const response = await apiGateway.getGtinByCode(code);
  return response;
};

const checkIfCodeExistsBatch = async (
  queryRunner: QueryRunner,
  codes: number[],
): Promise<Set<number>> => {
  if (codes.length == 0) return new Set();
  try {
    const rows = await queryRunner.manager.query(
      'SELECT prod_cod FROM cf_produto WHERE prod_cod IN (?)',
      [codes],
    );
    return new Set<number>(rows.map((row: any) => parseInt(row.prod_cod)));
  } catch (error) {
    Log.error(
      'Create Products: não foi possível buscar os produtos\n' +
        error +
        '\nCódigos:',
      codes,
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
    //   const values = records
    //     .map((record) => {
    //       Log.info('Create Products: criando o produto', record);
    //       const {
    //         prodCod,
    //         prodDesc,
    //         prodNome,
    //         prodEmpresa,
    //         prodEstabelecimento,
    //         prodFlag100g,
    //         prodProporcao,
    //         prodSku,
    //       } = record.getState();
    //       return `('${prodNome}', ${prodCod}, '${prodSku}', '${prodProporcao}', '${prodDesc}', ${prodEmpresa}, ${prodEstabelecimento}, '${prodFlag100g}' )`;
    //     })
    //     .join(', ');

    //   const query = `
    //   INSERT INTO cf_produto (prod_nome, prod_cod, prod_sku, prod_proporcao, prod_desc, prod_empresa, prod_estabelecimento, prod_flag100g )
    //   VALUES ${values}
    // `;

    const entities = queryRunner.manager.create(
      CfProdutoEntity,
      records.map((product) => {
     
        Log.info('Create Products: criando o produto', product.getState());
        return product.getState();
      }),
    );
    await queryRunner.manager.insert(CfProdutoEntity, entities);

    // await queryRunner.query(query);
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
          `WHEN ${record.getState().prodCod} THEN '${record.getState().prodNome.replace(/'/g, '')}'`,
      )
      .join(' ');
    const updateProdSku = records
      .map(
        (record) =>
          `WHEN ${record.getState().prodCod} THEN '${record.getState().prodSku}'`,
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
          `WHEN ${record.getState().prodCod} THEN '${record.getState().prodDesc.replace(/'/g, '')}'`,
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
const processBatch = async (): Promise<boolean> => {
  const queryRunner = mysqlDatabase.getConnection().createQueryRunner();
  const pageSize = 1000;

  for await (const products of apiGateway.fetchProducts(pageSize)) {
    await queryRunner.startTransaction();
    try {
      const codes = [
        ...new Set(products.map((record) => record.getState().prodCod)),
      ];
      Log.info(`TOTAL DE CODIGOS: ${codes.length}`)

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

      const transformedProducts = products.map((product) =>
        transformRecord(
          product,
          gtinsMap[product.getState().prodCod]?.gtinData || [],
          gtinsMap[product.getState().prodCod]?.categoryData || [],
        ),
      );

      const existingCodes = await checkIfCodeExistsBatch(queryRunner, codes);
      Log.info(`TOTAL DE PRODUTOS EXISTENTES: ${existingCodes.size}`)


      const { newRecords, existingRecords } = transformedProducts.reduce(
        (acc, product) => {
          try {
            if (existingCodes.has(product.getState().prodCod))
              acc.existingRecords.push(product);
            else acc.newRecords.push(product);
          } catch (error) {
            Log.error(
              `Create Products: falha ao criar preço \nErro:${error}\nPreço:`,
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
        insertBatch(queryRunner, newRecords),
        updateBatch(queryRunner, existingRecords),
      ]);

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      console.log(err);
      Log.error('Create Products: Erro ao realizar carga geral');
      continue;
    }
  }
  await queryRunner.release();
  return true
};

async function cargaGeralProdutos() {
  try {
    var startTime = performance.now();
    Log.setClientName('casa-do-arroz');
    await Promise.all([
      mysqlDatabase.connect(),
      apiGateway
      .login(),
        // '6f8YuMAG5II-hmaWDzpCkIj-xvG703EUyWZq9t8bPQhFrrrXc3eJLAJNRA2c_4RQiDLjBf-w2qGd421qOB1XnKMdJmX27327CBxM9y6zfRKWbkcsghhg6feWB_aSkXukS8YbbB88PdTn-c3FGnQ4CeAOVXLswD7F-_1tX19dzgIOknxYf2TYytLu2LvZogKwrs1d_xsbFP4jYBI6gpQgBK39BRS7RcpkPKfd0Ow8D0hwwPF4zDhN2B45tzvpqx8sgUBgA1iOMhji0mJF3BJUXAHwJz2oSjmLuQ35QCX0RQ2mDLGMDzg-Eont-m6nKXwtzOX2IzvYx66z39Q-i-2qLs69Vlp2U0Y9expwmJXEXJ_ivDUy1RLnY_nMeQbk5b6R4R9DNmQ9RzzUye-TLhzpH3mPrKiENTXao58oJGHdHnbB2_3ojy2QMGtI21z08i7o-7L40d-rhRyL_-29PmK9Ay4kOrfA3Z414daYkIRrLV_z7voUpdB8bU6D45R4msY0iVo_Em3quIgwpPMqG02wYWW3cogbl4j4MdMpzFBqZYfCCILCwrWakgTkfQLrz-_rHms8tYJPzydXedjG-LDLv1wfW6qDSjwyING48NWt-KzyheoVe_kdFe21zhYvuh6TaDGSE_8QXUy2wE593Y09Ktj22mxkmjW-L2vpFnsiwp_K3RPvPdllQbN6CUXXwSVdSb-x_A',
    ]);

    const result = await processBatch();

    var endTime = performance.now();
    var time = ((endTime - startTime) / 1000).toFixed(4);
    return `Script Carga Geral de Produtos finalizado com sucesso! -- ${time} segundos`;
  } catch (error) {
    throw error;
  }
}
cargaGeralProdutos();
export { cargaGeralProdutos };
