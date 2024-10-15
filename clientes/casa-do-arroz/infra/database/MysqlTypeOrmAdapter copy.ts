import { DataSource } from "typeorm";
import Connection from "../../../shared/database/Connection";

export default class MysqlTypeOrmAdapter implements Connection<DataSource> {
	dataSource: DataSource;

	getConnection(): DataSource {
		return this.dataSource;
	}

	async connect(): Promise<void> {
		try {
			const connection = new DataSource({
				type: 'mysql',
				dropSchema: false,
				migrationsRun: false,
				entities: [__dirname + '/mapping/*.{js,ts}'],
				host: '127.0.0.1',
				port: 3306,
				username: "root",
				password: "root",
				database:  "cf_teste",
				bigNumberStrings: false,
				supportBigNumbers: true,
			});
			this.dataSource = await connection.initialize();

		} catch (error) {
			console.error(error);
			throw error
			// throw new DatabaseConnectionException();
		}
	}
	async close(): Promise<void> {
		await this.dataSource.destroy()
	}

	
}