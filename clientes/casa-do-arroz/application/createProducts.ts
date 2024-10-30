import { QueryRunner } from 'typeorm';
import { performance } from 'perf_hooks';
import ApiGatewayHttp from '../infra/http/apiGatewayHttp';
import Product from '../domain/entities/Product';
import { APIPackaging } from '../domain/dtos/PackageDTO';
import { ProductDivision } from '../domain/dtos/CategoryDTO';
import AxiosAdapter from '../../shared/http/AxiosAdapter';
import Log from '../infra/Logger';
import MysqlTypeOrmAdapter from '../infra/database/MysqlTypeOrmAdapter';
import { CfProdutoEntity } from '../infra/database/mapping/CfProduto';

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

const fetchProducts = async (): Promise<Product[]> => {
  const response = await apiGateway.getAllProducts();
  return response;
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
          .map((record) => {
            const prodNome = record.getState().prodNome;
            return `WHEN ${record.getState().prodCod} THEN "${prodNome ? prodNome.replace(/"/g, '\\"') : ''}"`;
          })
          .join(' ');

        const updateProdSku = records
          .map((record) => {
            const prodSku = record.getState().prodSku;
            return `WHEN ${record.getState().prodCod} THEN "${prodSku ? prodSku : ''}"`;
          })
          .join(' ');

        const updateProdProporcao = records
          .map((record) => {
            const prodProporcao = record.getState().prodProporcao;
            return `WHEN ${record.getState().prodCod} THEN "${prodProporcao ? prodProporcao.replace(/"/g, '\\"') : ''}"`;
          })
          .join(' ');

        const updateProdDesc = records
          .map((record) => {
            const prodDesc = record.getState().prodDesc;
            return `WHEN ${record.getState().prodCod} THEN "${prodDesc ? prodDesc.replace(/"/g, '\\"') : ''}"`;
          })
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

const processBatch = async (queryRunner: QueryRunner) => {
  // const queryRunner = mysqlDatabase.getConnection().createQueryRunner();

  await queryRunner.startTransaction();
  try {
    const products = await fetchProducts();
    const codes = [
      ...new Set(products.map((record) => record.getState().prodCod)),
    ];

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
      transformRecord(
        product,
        gtinsMap[product.getState().prodCod].gtinData,
        gtinsMap[product.getState().prodCod].categoryData,
      ),
    );

    const existingCodes = await checkIfCodeExistsBatch(queryRunner, codes);

    const { newRecords, existingRecords } = transformedProducts.reduce(
      (acc, product, index) => {
        try {
          if (existingCodes.has(product.getState().prodCod))
            acc.existingRecords.push(product);
          else acc.newRecords.push(product);
        } catch (error) {
          Log.error(
            `Create Products: falha ao criar preço \nErro:${error}\nPreço:`,
            product,
          );
        } finally {
          return acc;
        }
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
    console.log("[CASA-DO-ARROZ] :: CreateProducts :: ",err);
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
};

async function createProducts() {
  try {
    const mysqlDatabase = new MysqlTypeOrmAdapter();

    var startTime = performance.now();
    Log.setClientName('casa-do-arroz');
    await Promise.all([
      mysqlDatabase.connect(),
      apiGateway.login(
        // 'U7-jRa1naTa0DyYs8jp9U34ES7M-IFNlrFZirwwIUBQ7JxJ_3yndNy968Qkpm9atYPXIdpVRJgQXkgXNlPspHWdS2m4X6A0KMeov8GKzgBx3IPuqwaGIDwk5ArzOhYwiCzuVdB0CMPUVl_n3oCiXcn99bcL7IflZIFGus4eP_xEfaOwhRB2fejd6LoaM8a5sBMqZQwpLuFlMzBNWSyC2YmaPnB8uCJ9TsHm3ycOEkBE80lzFUt9Yz0_DsUSSyt_VvZo7gai9MWPomAXyxNUUHumFWTlAxI9m8gd4J_EPCUy4Pa0hnn7WiYYG1QPn4ncIyCn_TMS5UDckFRbJzrGGmbkRqmXRgRv_gGGpimBy5xNdRfehNsYo_7Z5VjDds_T_n8BjeSNxQCXKuPyMDCFH2859nlcFn-VaDZxJK_mFvg8IA_TUjQdQvwltRf_4kefNILZ7xfrMEeqH8na1Q6ZbX1bNp1d0p1yJw00LPUDCzeWCZzkGnkBFzlNb0RJL3QG7bPOP92Q56cKiCSya3dQGDKkGcwu3xoCfqe58E3kZIioezKrc4wSqGr_zZ5N4LmToTvt1vJs5FnIuNwRqxDOQxyWPFFbUoaGEn1hx-Ea-5le4ZZM6Nrgc0dQKaLyneO3jxkJqxizd5g-IJ6m9cY_2RrN9jj_usCzn0EfbCiFMMilFYwsKATpyLhaT5RFX9xAWNDBAng',
      ),
    ]);
    const queryRunner = mysqlDatabase.getConnection().createQueryRunner()
    await processBatch(queryRunner);

    var endTime = performance.now();
    var time = ((endTime - startTime) / 1000).toFixed(4);
    console.log(`[CASA-DO-ARROZ] :: CreateProducts :: Script finalizado com sucesso! -- ${time} segundos `)
    return `[CASA-DO-ARROZ] :: CreateProducts :: Script finalizado com sucesso! -- ${time} segundos `
    } catch (error) {
      throw new Error(`[CASA-DO-ARROZ] :: CreateProducts :: Erro ao executar script ${error}`);
    }
}

export { createProducts };
