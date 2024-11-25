import axios from 'axios';
import mysql from 'mysql2/promise';
import { RowDataPacket } from 'mysql2'; 

interface SalvePreco {
    ProductKey: string;
    precoItem: string;
    nome: string;
    dinamicaID: number;
    percentualDesconto: number;
    dataInicio: string,
    dataFim: string,
}

async function conn() {
    const connection = await mysql.createConnection({
      host: 'cartazfacilpro.ctj8bnjcqdvd.us-east-2.rds.amazonaws.com',
      user: 'cartazdb',
      password: 'tbCJShR2',
      database: 'casadoarroz',
    });
  
    return connection;
  }

async function Requestlogin() {
    const response = await axios.post(`https://hs170515.consinco.cloudtotvs.com.br:8343/api/v1/auth/login`, {
        company: '1',
        username: 'VINICIUSCA',
        password: 'Carroz#v#300724',
      });
      return response.data.access_token
}

async function RequestProductsForSave(token: string): Promise<SalvePreco[]> {
    const config = {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    };

    const arraySalve: SalvePreco[] = [];

    try {
        const response = await axios.get(
            `https://hs170515.consinco.cloudtotvs.com.br:8343/SMPromocoesAPI/api/v1/CombosPromocionais?PageSize=500&NroEmpresa=1`,
            config
        );

        const dados = response.data['items'];
        var nome = '';
       

        for (const dado of dados) {
           
            if (dado['itens'][1]['familia']['descricao']) {
                nome = dado['itens'][1]['familia']['descricao'];
            } 
            else 
            {

                nome = dado['itens'][1]['produto']['descricaoReduzida'];             
            
            }

           var dataInicio = dado["dataInicio"];
           var dataFim = dado["dataFim"];

            arraySalve.push(salvePrecoAdapter(dado['itens'][0]['seqProduto'], dado['itens'][0]["precoItem"], nome, 
                dado['itens'][1]['percentualDesconto'], dataInicio, dataFim));
        
        }

     //   console.log(arraySalve);

        return arraySalve;

    } catch (error) {
        console.error("Error fetching products:", error);
        throw error;  
    }
}


function salvePrecoAdapter(ProductKey: string, precoItem: string, nome: string, percentualDesconto: number, dataInicio: string,
    dataFim: string): SalvePreco {
    var dinamica = 9;

    if (percentualDesconto > 0) {
        dinamica = 10
    }

    return {
        ProductKey: ProductKey,
        precoItem: precoItem.toString().replace(/\./g, ','),
        nome: nome,
        dinamicaID: dinamica,
        percentualDesconto: percentualDesconto,
        dataInicio: dataInicio,
        dataFim: dataFim,
    };
}

async function loadProductKey(pro: { ProductKey: string }[]): Promise<string[]> {
    const produtosKeys: string[] = [];
    
    for (const dado of pro) {
        console.log(dado);

        produtosKeys.push(dado['ProductKey']);
    }

    return produtosKeys;
}


async function getProductsOnDataBase(pro) {
    var produtosKeys = pro.map(dado => dado['ProductKey']);
    var co = await conn();
    const inClause = new Array(produtosKeys.length).fill('?').join(',');
    var data = await co.execute(
        'SELECT * FROM cf_produto WHERE prod_cod IN (' + inClause + ')', 
        produtosKeys
    );
    console.log(data);
    co.end();
}



async function updateOrCreateData() {
    
}


async function createProductsLevePague() {

   const token = await Requestlogin();
   const produtosRequest = await RequestProductsForSave(token);
   const forSave = getProductsOnDataBase (produtosRequest);
} 


export { createProductsLevePague }