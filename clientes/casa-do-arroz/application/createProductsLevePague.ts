import axios from 'axios';


interface SalvePreco {
    ProductKey: string;
    precoItem: string;
    nome: string;
    dinamicaID: number;
    percentualDesconto: number;
    dataInicio: string,
    dataFim: string,
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

        console.log(arraySalve);

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



async function getProductsOnDataBase() {
    
} 


async function updateOrCreateData() {
    
}


async function createProductsLevePague() {

   const token = await Requestlogin();
   await RequestProductsForSave(token);
   //console.log(token);
    
} 


export { createProductsLevePague }