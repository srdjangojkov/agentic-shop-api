import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Category, CategoryDocument } from "./category.schema";

// Mirrors the express-validator chains in ../../../src/validators/categories.ts and the
// DB checks in ../../../src/validators/db-validators.ts, including their error entries.
// Chains do not stop at the first failure, as in Express. Differences: parity.md.

export type FieldError = {
  type: "field";
  value?: unknown;
  msg: string;
  path: string;
  location: "params" | "body";
};

const INVALID_VALUE = "Invalid value";

// validator.js isMongoId: 24 hexadecimal characters.
const isMongoId = (value: unknown) => typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value);

const paramError = (value: unknown, msg: string): FieldError => ({ type: "field", value, msg, path: "id", location: "params" });

@Injectable()
export class CategoriesValidation {
  constructor(@InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>) {}

  // GET and DELETE: check("id").isMongoId().custom(categoryIdExists)
  async validateId(id: string): Promise<FieldError[]> {
    const errors: FieldError[] = [];
    if (!isMongoId(id)) errors.push(paramError(id, INVALID_VALUE));
    await this.check(errors, paramError.bind(null, id), () => this.categoryIdExists(id));
    return errors;
  }

  // Runs a custom check; a thrown error becomes an entry with its message, as in express-validator.
  private async check(errors: FieldError[], toError: (msg: string) => FieldError, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (error) {
      errors.push(toError(error instanceof Error ? error.message : String(error)));
    }
  }

  private async categoryIdExists(id: string) {
    const category = await this.categoryModel.findById(id);
    if (!category) {
      throw new Error(`Category id: ${id} doesn't exist`);
    }
  }
}
