FROM node:18-bullseye-slim

WORKDIR /app
RUN apt update \
    && apt install -y \
        unzip \
        libaio1

RUN mkdir /opt/oracle 
COPY ./oracle-setup/instantclient-basiclite-linuxx64.zip /opt/oracle/instantclient-basiclite-linuxx64.zip
RUN cd /opt/oracle && unzip instantclient-basiclite-linuxx64.zip 
RUN sh -c "echo /opt/oracle/instantclient_23_5 > \                                            
    /etc/ld.so.conf.d/oracle-instantclient.conf" && ldconfig

COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN npm run build

RUN npm install mysql2

EXPOSE 3000
CMD ["node", "dist/clientes/main.js"]
