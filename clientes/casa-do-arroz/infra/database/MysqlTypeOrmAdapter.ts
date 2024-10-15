import { DataSource } from "typeorm";
import Connection from '../../../shared/database/Connection';
import { CfDailyprintEntity } from "./mapping/CfDailyprint";
import { CfProdutoEntity } from "./mapping/CfProduto";
import { CfValorEntity } from "./mapping/CfValor";

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
				entities: [CfProdutoEntity, CfValorEntity, CfDailyprintEntity],
				host: 'cartazfacilpro.ctj8bnjcqdvd.us-east-2.rds.amazonaws.com',
				port: 3306,
				username: "cartazdb",
				password: "tbCJShR2",
				database:  "supermercadoscasadoarroz",
				bigNumberStrings: false,
				supportBigNumbers: true,
			});
			this.dataSource = await connection.initialize();

		} catch (error) {
			console.error(error);
			throw new Error('Falha ao conectar com o banco de dados');
			// throw new DatabaseConnectionException();
		}
	}

	
}