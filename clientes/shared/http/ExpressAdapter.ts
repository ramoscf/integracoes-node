import HttpServer from "./HttpServer";
import express, { Request, Response } from "express";

export default class ExpressAdapter implements HttpServer {
	app: any;

	constructor () {
		this.app = express();
		this.app.use(express.json());
	}

	on(method: string, url: string, callback: Function): void {
		this.app[method](url, async function (request: Request, response: Response) {
			try {
				const output = await callback(request.params, request.body);
				response.json(output);
			} catch (e: any) {
				response.status(422).json({
					message: e.message
				});
			}
		});
	}

	listen(port: number): void {
		console.log(`Servidor rodando na porta ${port}`)
		this.app.listen(port);
	}

}