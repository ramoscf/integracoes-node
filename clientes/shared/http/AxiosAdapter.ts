import axios from 'axios';
import HttpClient from './HttpClient';
import Log from '../log/Logger';

export default class AxiosAdapter implements HttpClient {
  private headers: { [key: string]: string };

  constructor() {
    axios.defaults.validateStatus = function () {
      return true;
    };
  }

  setHeaders(headers: { [key: string]: string }): void {
    this.headers = headers;
  }

  async get(url: string): Promise<any> {
    const response = await axios.get(url, {
      headers: this.headers,
      timeout: 1000000, // 10 segundos
    });
    if (response.status !== 200) throw new Error(response.data.message);
    return response.data;
  }

  async post(url: string, body: any): Promise<any> {
    const response = await axios.post(url, body, {
      headers: this.headers,
      timeout: 1000000, // 10 segundos
    });
    if (response.status === 422) throw new Error(response.data.message);
    return response.data;
  }
}
