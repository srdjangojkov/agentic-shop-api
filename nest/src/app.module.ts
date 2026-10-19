import { DynamicModule, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CategoriesModule } from "./categories/categories.module";

// The database URI is passed in explicitly: main.ts uses DB_URI, tests pass an
// isolated in-memory database. Nothing here reads the environment.
@Module({})
export class AppModule {
  static forRoot(mongoUri: string): DynamicModule {
    return {
      module: AppModule,
      imports: [MongooseModule.forRoot(mongoUri), CategoriesModule],
    };
  }
}
