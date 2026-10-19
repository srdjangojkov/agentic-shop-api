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

  const app = await NestFactory.create(AppModule.forRoot(mongoUri));
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  await app.listen(port);
  console.log(`NestJS ready on port ${port}`);
}

bootstrap();
