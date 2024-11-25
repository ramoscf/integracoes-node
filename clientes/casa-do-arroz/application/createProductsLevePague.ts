import axios from 'axios';


interface SalvePreco {
    ProductKey: string;
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

        for (const dado of dados) {
            console.log("======================================================================>>>>");
            console.log(dado['itens'][0]['seqProduto']);  

            arraySalve.push(salvePrecoAdapter(dado['itens'][0]['seqProduto']));
            console.log("======================================================================>>>>");
        }

        console.log(arraySalve);

        return arraySalve;

    } catch (error) {
        console.error("Error fetching products:", error);
        throw error;  
    }
}


function salvePrecoAdapter(ProductKey: string): SalvePreco {
    return {
        ProductKey: ProductKey
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