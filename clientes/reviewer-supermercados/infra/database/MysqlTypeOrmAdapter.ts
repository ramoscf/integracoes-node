import { DataSource } from "typeorm";
import { CfProdutoEntity } from "./mapping/CfProduto";
import { CfValorEntity } from "./mapping/CfValor";
import Connection from "./Connection";

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
				entities: [CfProdutoEntity, CfValorEntity],
				host: 'cartazfacilpro.ctj8bnjcqdvd.us-east-2.rds.amazonaws.com',
				port: 3306,
				username: "cartazdb",
				password: "tbCJShR2",
				database:  "reviwer",
				bigNumberStrings: false,
				supportBigNumbers: true,
			});
			this.dataSource = await connection.initialize();

		} catch (error) {
			console.error(error);
			throw new Error();
			// throw new DatabaseConnectionException();
		}
	}
	async close(): Promise<void> {
		await this.dataSource.destroy()
	}

	
}