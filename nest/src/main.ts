import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

const DEFAULT_PORT = 3003;

async function bootstrap() {
  const mongoUri = process.env.DB_URI;
  if (!mongoUri) {
    throw new Error("DB_URI is not set. Copy nest/.env.example to nest/.env and fill it in.");
  }

  const jwtSecret = process.env.SECRET_JWT;
  if (!jwtSecret) {
    throw new Error("SECRET_JWT is not set. Add it to nest/.env with the same value as the Express app so its access tokens verify.");
  }

  const app = await NestFactory.create(AppModule.forRoot(mongoUri, jwtSecret));
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  await app.listen(port);
  console.log(`NestJS ready on port ${port}`);
}

bootstrap();
