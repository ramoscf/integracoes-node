import { DataSource } from "typeorm";
import Connection from "../shared/database/Connection";

export default class MssqlTypeOrmAdapter implements Connection<DataSource> {
	dataSource: DataSource;

  getConnection():DataSource {
    return this.dataSource;
  }

  async connect(): Promise<void> {
    try {
      
      const connection = new DataSource({
        type: 'mssql',
        dropSchema: false,
        migrationsRun: false,
        entities: [],
        host: "187.63.79.22",
        port: 5000,
        username: "universo digital",
        password: 'universo!@#',
        database: 'Solidcon',
        requestTimeout: 600000,
        options: {
          encrypt: false,
          enableArithAbort: true
        }
      });
      this.dataSource = await connection.initialize();

    
    } catch (error) {
      throw error
      // throw new DatabaseConnectionException();
    }
  }

}
