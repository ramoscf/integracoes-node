export default interface HttpClient {
  setHeaders(headers: {
    [key: string]: string
  }): void;
  get(url: string): Promise<any>;
  post(url: string, body: any): Promise<any>;
}
