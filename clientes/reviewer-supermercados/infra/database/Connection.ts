export default interface Connection<T = any> {
  connect(): Promise<void>;
  getConnection(): T;
  // query(query: string): Promise<any>;
}
