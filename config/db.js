import env from './env.js';

const db = {
  HOST: env.DB_HOST,
  USER: env.DB_USER,
  PASSWORD: env.DB_PASSWORD,
  DATABASE: env.DB_NAME,
  port: env.DB_PORT,
  DIALECT: env.DB_DIALECT
};

export default db;