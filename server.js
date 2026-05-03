import express, { Router } from "express";
import dotenv from "dotenv";
import './models/index.js';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import router from "./routes/adminRoutes.js";
import userRouter from "./routes/user.routes.js";
import locationRoutes from "./routes/locationRoutes.js"
import orderRouter from "./routes/orderRoutes.js"

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5678;
const HOST = "0.0.0.0";

app.use(express.json());
app.use(cors({   origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "http://localhost:5174",
      "https://darhubfrontend.onrender.com"
    ], credentials: true }));


// Load Swagger YAML
const swaggerDocument = yaml.load(fs.readFileSync(path.join(__dirname, 'swagger.yaml'), 'utf8'));

// Swagger UI route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));


app.get("/",(req,res)=>{
    res.send("Welcome to darhub Backend");
})

app.use('/admin',router)
app.use('/api',userRouter)
app.use("/api/locations", locationRoutes);
app.use('/order',orderRouter)



app.listen(PORT,HOST,()=>{
    console.log(`Server is running on http://localhost:${PORT}`);
})