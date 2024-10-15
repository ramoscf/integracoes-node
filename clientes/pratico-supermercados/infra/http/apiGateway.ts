export interface ApiGateway {
  getAlteredProducts(branchId: number): any;
  getAllProducts(pageSize: number, branchId: number): any;
  getBranches(): Promise<any>;
}
