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
const nameError = (value: unknown, msg: string): FieldError => ({ type: "field", value, msg, path: "name", location: "body" });

// express-validator's toString for the notEmpty check.
const asString = (value: unknown) => (value === undefined || value === null ? "" : String(value));

// Objects and arrays never reach a query: Express used them as query operators (S8, parity.md).
const isStructured = (value: unknown) => typeof value === "object" && value !== null;

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

  // POST: check("name").exists().not().isEmpty().custom(categoryExists), body only.
  async validateCreate(name: unknown): Promise<FieldError[]> {
    if (isStructured(name)) return [nameError(name, INVALID_VALUE)];

    const errors: FieldError[] = [];
    if (name === undefined) errors.push(nameError(name, INVALID_VALUE));
    if (asString(name) === "") errors.push(nameError(name, INVALID_VALUE));
    await this.check(errors, nameError.bind(null, name), () => this.categoryExists(name));
    return errors;
  }

  // PUT: check("id").isMongoId(), check("id").custom(categoryIdExists),
  // check("id", "name").custom(categoryToChangeExists). Errors are reported on the id.
  async validateUpdate(id: string, name: unknown): Promise<FieldError[]> {
    const errors: FieldError[] = [];
    if (!isMongoId(id)) errors.push(paramError(id, INVALID_VALUE));
    await this.check(errors, paramError.bind(null, id), () => this.categoryIdExists(id));
    if (isStructured(name)) {
      errors.push(nameError(name, INVALID_VALUE));
    } else {
      await this.check(errors, paramError.bind(null, id), () => this.categoryToChangeExists(id, name));
    }
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

  private async categoryExists(name: unknown) {
    const category = await this.categoryModel.findOne({ name });
    if (category) {
      throw new Error(`${name} already exists`);
    }
  }

  private async categoryToChangeExists(id: string, name: unknown) {
    const category = await this.categoryModel.findById(id);
    if (name !== category?.name) {
      return this.categoryExists(name);
    }
  }
}
