export interface ApiGateway {
    getPromotions(branchId: number): Promise<any>
    getAllPrices(): Promise<any>
	getProductsByCode(codes?: number[]): Promise<any>;
    getAllProducts(): Promise<any>;
    getGtinByCode(code: number): Promise<any>
    getBranches(): Promise<any>;
}
