import axios from 'axios';


async function Requestlogin() {
    const response = await axios.post(`https://hs170515.consinco.cloudtotvs.com.br:8343/api/v1/auth/login`, {
        company: '1',
        username: 'VINICIUSCA',
        password: 'Carroz#v#300724',
      });
      return response.data.access_token
}

async function RequestPruductsForSave() {
    
}

async function getProductsOnDataBase() {
    
} 


async function updateOrCreateData() {
    
}


async function createProductsLevePague() {
    
   const token = await Requestlogin();
   console.log(token);
    
} 


export { createProductsLevePague }