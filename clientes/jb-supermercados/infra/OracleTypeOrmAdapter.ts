import { DataSource } from 'typeorm';
import * as sql from 'mssql';
import Connection from '../../shared/database/Connection';

export default class OracleTypeOrmAdapter implements Connection<DataSource> {
  dataSource: DataSource;

  getConnection(): DataSource {
    return this.dataSource;
  }

  async connect(): Promise<void> {
    try {
      const connection = new DataSource({
        type: 'oracle',
        dropSchema: false,
        migrationsRun: false,
        entities: [],
        username: 'CLT158356CARTAZFACIL',
        password: 'vqsug84526ZFYWU!?',
        connectString: `
        (DESCRIPTION =
        (ADDRESS = (PROTOCOL = TCP)(HOST = 189.126.152.125)(PORT = 1521))
        (CONNECT_DATA =
        (SERVER = DEDICATED)
        (SERVICE_NAME = CHI9VL_158356_C)))
        `,
      });
      this.dataSource = await connection.initialize();
    } catch (error) {
      throw error;
      // throw new DatabaseConnectionException();
    }
  }
}
