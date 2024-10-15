import { createPrices } from './application/createPrices';
import { createProducts } from './application/createProducts';
import { createPromotions } from './application/createPromotions';
import OracleTypeOrmAdapter from './infra/OracleTypeOrmAdapter';

async function test() {
  try {
    console.log('teste');
    const db = new OracleTypeOrmAdapter();
    await db.connect();
    const qr = db.getConnection().createQueryRunner();
    const res = await qr.stream(
      'SELECT * FROM CLT158356CARTAZFACIL.CTZFCL_PROMOCAO where rownum = 1'
    );

    res.on('data', async (record) => {

        res.pause()
      console.log(record);
      res.resume()
    })
    .on('end', async ()=>{
        console.log('end')
        await qr.release()
    }).on('error', async ()=>{
        console.log('error')
        await qr.release()
    })
  } catch (error) {
    console.log('erro', error);
  }
}

export { createProducts, createPrices, createPromotions, test };
