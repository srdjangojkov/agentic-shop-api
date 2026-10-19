import { DynamicModule, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "./auth/auth.module";
import { CategoriesModule } from "./categories/categories.module";

// The database URI and JWT secret are passed in explicitly: main.ts uses DB_URI and
// SECRET_JWT, tests pass an isolated in-memory database and a test secret.
// Nothing here reads the environment.
@Module({})
export class AppModule {
  static forRoot(mongoUri: string, jwtSecret: string): DynamicModule {
    return {
      module: AppModule,
      imports: [MongooseModule.forRoot(mongoUri), AuthModule.forRoot(jwtSecret), CategoriesModule],
    };
  }
}
